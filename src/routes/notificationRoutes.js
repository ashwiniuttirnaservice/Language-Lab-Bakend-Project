const express = require("express");
const router = express.Router();

const notificationController = require("../controller/notificationController");
const protectUser = require("../middlewares/protectUser");

// All notification operations require authenticated user token
router.use(protectUser);

router.get("/", notificationController.getNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.patch("/read-all", notificationController.markAllAsRead);
router.patch("/:id/read", notificationController.markAsRead);
router.delete("/:id", notificationController.deleteNotification);

module.exports = router;
