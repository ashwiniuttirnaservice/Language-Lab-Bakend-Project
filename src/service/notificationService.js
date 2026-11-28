const Notification = require("../models/Notification");
const Student = require("../models/Student");

/**
 * Service to handle creation and dispatch of notifications.
 */
class NotificationService {
  /**
   * Create a single notification.
   */
  static async createNotification(payload) {
    try {
      const notification = await Notification.create(payload);
      return notification;
    } catch (error) {
      console.error("[NotificationService] Error creating notification:", error);
      return null;
    }
  }

  /**
   * Bulk create notifications for multiple students (e.g. whole batch or assigned students).
   */
  static async createBulkNotifications(studentIds, commonPayload) {
    try {
      if (!studentIds || !studentIds.length) return [];

      const docs = studentIds.map((studentId) => ({
        ...commonPayload,
        recipient_type: "student",
        recipient_id: studentId,
        recipient_model: "Student",
      }));

      return await Notification.insertMany(docs, { ordered: false });
    } catch (error) {
      console.error("[NotificationService] Error creating bulk notifications:", error);
      return [];
    }
  }

  /**
   * Notify students of an institute filtered by department and academic year.
   */
  static async notifyStudentsByBatch({
    instituteId,
    department,
    academicYear,
    commonPayload,
  }) {
    try {
      const query = { institute_id: instituteId, is_active: { $ne: false } };
      if (department) query.department = department;
      if (academicYear) query.academic_year = academicYear;

      const students = await Student.find(query).select("_id").lean();
      if (!students.length) return [];

      const studentIds = students.map((s) => s._id);
      return await this.createBulkNotifications(studentIds, {
        ...commonPayload,
        institute_id: instituteId,
      });
    } catch (error) {
      console.error("[NotificationService] Error in notifyStudentsByBatch:", error);
      return [];
    }
  }

  /**
   * Send notification to an Institute (Admin or Faculty).
   */
  static async notifyInstitute({
    instituteId,
    title,
    description,
    category,
    type,
    priority = "Info",
    actionUrl = "",
    actionLabel = "View Details",
    metaData = {},
  }) {
    try {
      return await Notification.create({
        recipient_type: "institute",
        recipient_id: instituteId,
        recipient_model: "Institute",
        institute_id: instituteId,
        title,
        description,
        category,
        type,
        priority,
        action_url: actionUrl,
        action_label: actionLabel,
        meta_data: metaData,
      });
    } catch (error) {
      console.error("[NotificationService] Error in notifyInstitute:", error);
      return null;
    }
  }
}

module.exports = NotificationService;
