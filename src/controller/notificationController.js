const Notification = require("../models/Notification");
const { sendResponse, sendError } = require("../utils/apiResponse");

/**
 * Helper to extract current user/recipient context from req.
 */
const getRecipientContext = (req) => {
  if (req.student && req.student._id) {
    return {
      recipientId: req.student._id,
      recipientType: "student",
      instituteId: req.student.institute_id,
    };
  }
  if (req.teacher && req.teacher._id) {
    return {
      recipientId: req.teacher._id,
      recipientType: "teacher",
      instituteId: req.teacher.institute_id,
    };
  }
  if (req.institute && req.institute._id) {
    return {
      recipientId: req.institute._id,
      recipientType: "institute",
      instituteId: req.institute._id,
    };
  }
  return null;
};

/**
 * GET /api/notifications
 * Fetch notifications for current logged in user with priority filters & tab stats.
 */
const getNotifications = async (req, res) => {
  try {
    const context = getRecipientContext(req);
    if (!context) {
      return sendError(res, 401, false, "Unauthorized recipient.");
    }

    const { priority, category, is_read, page = 1, limit = 20 } = req.query;

    const baseQuery = {
      recipient_id: context.recipientId,
    };

    const filterQuery = { ...baseQuery };

    if (priority && priority.toLowerCase() !== "all") {
      // Case-insensitive match on priority (Incomplete, Resubmit, Results, Completed, Info)
      filterQuery.priority = new RegExp(`^${priority}$`, "i");
    }

    if (category && category.toLowerCase() !== "all") {
      filterQuery.category = category.toLowerCase();
    }

    if (typeof is_read !== "undefined") {
      filterQuery.is_read = is_read === "true" || is_read === true;
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    // Execute queries in parallel
    const [notifications, total, unreadCount, priorityAgg] = await Promise.all([
      Notification.find(filterQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Notification.countDocuments(filterQuery),
      Notification.countDocuments({ ...baseQuery, is_read: false }),
      Notification.aggregate([
        { $match: baseQuery },
        { $group: { _id: { $toLower: "$priority" }, count: { $sum: 1 } } },
      ]),
    ]);

    // Build tab counts dictionary for UI
    const tabCounts = {
      all: 0,
      incomplete: 0,
      resubmit: 0,
      results: 0,
      completed: 0,
    };

    let totalAll = 0;
    priorityAgg.forEach((item) => {
      totalAll += item.count;
      const key = item._id;
      if (tabCounts.hasOwnProperty(key)) {
        tabCounts[key] = item.count;
      }
    });
    tabCounts.all = totalAll;

    return sendResponse(res, 200, true, "Notifications retrieved successfully.", {
      notifications,
      tab_counts: tabCounts,
      unread_count: unreadCount,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        total_pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error("[getNotifications] Error:", error);
    return sendError(res, 500, false, "Failed to retrieve notifications.", null, error.message);
  }
};

/**
 * GET /api/notifications/unread-count
 * Fast endpoint for polling navbar notification badges.
 */
const getUnreadCount = async (req, res) => {
  try {
    const context = getRecipientContext(req);
    if (!context) {
      return sendError(res, 401, false, "Unauthorized recipient.");
    }

    const unreadCount = await Notification.countDocuments({
      recipient_id: context.recipientId,
      is_read: false,
    });

    return sendResponse(res, 200, true, "Unread count retrieved.", {
      unread_count: unreadCount,
    });
  } catch (error) {
    console.error("[getUnreadCount] Error:", error);
    return sendError(res, 500, false, "Failed to get unread count.", null, error.message);
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
const markAsRead = async (req, res) => {
  try {
    const context = getRecipientContext(req);
    if (!context) {
      return sendError(res, 401, false, "Unauthorized recipient.");
    }

    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient_id: context.recipientId },
      { is_read: true, read_at: new Date() },
      { new: true }
    );

    if (!notification) {
      return sendError(res, 404, false, "Notification not found or access denied.");
    }

    return sendResponse(res, 200, true, "Notification marked as read.", notification);
  } catch (error) {
    console.error("[markAsRead] Error:", error);
    return sendError(res, 500, false, "Failed to update notification.", null, error.message);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read for current recipient.
 */
const markAllAsRead = async (req, res) => {
  try {
    const context = getRecipientContext(req);
    if (!context) {
      return sendError(res, 401, false, "Unauthorized recipient.");
    }

    const result = await Notification.updateMany(
      { recipient_id: context.recipientId, is_read: false },
      { is_read: true, read_at: new Date() }
    );

    return sendResponse(res, 200, true, "All notifications marked as read.", {
      modified_count: result.modifiedCount,
    });
  } catch (error) {
    console.error("[markAllAsRead] Error:", error);
    return sendError(res, 500, false, "Failed to mark all as read.", null, error.message);
  }
};

/**
 * DELETE /api/notifications/:id
 * Delete or dismiss a single notification.
 */
const deleteNotification = async (req, res) => {
  try {
    const context = getRecipientContext(req);
    if (!context) {
      return sendError(res, 401, false, "Unauthorized recipient.");
    }

    const { id } = req.params;
    const result = await Notification.findOneAndDelete({
      _id: id,
      recipient_id: context.recipientId,
    });

    if (!result) {
      return sendError(res, 404, false, "Notification not found or access denied.");
    }

    return sendResponse(res, 200, true, "Notification dismissed successfully.");
  } catch (error) {
    console.error("[deleteNotification] Error:", error);
    return sendError(res, 500, false, "Failed to delete notification.", null, error.message);
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
