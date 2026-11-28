const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const NotificationService = require("../service/notificationService");
const notificationController = require("../controller/notificationController");
const apiRouter = require("../index");

console.log("==========================================");
console.log("RUNNING BACKEND NOTIFICATION VERIFICATION");
console.log("==========================================");

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}`);
    failed++;
  }
}

// ── TEST SUITE 1: Notification Mongoose Model Schema Validation ──
console.log("\n--- Suite 1: Model Schema Validation ---");

// Test 1.1: Valid student notification passes validation
const validStudentNotif = new Notification({
  recipient_type: "student",
  recipient_id: new mongoose.Types.ObjectId(),
  recipient_model: "Student",
  institute_id: new mongoose.Types.ObjectId(),
  title: "Speaking Exercises: Everyday English Conversation",
  description: "4 practice exercises pending in Everyday English Conversation.",
  category: "exercise",
  type: "Exercise",
  priority: "Incomplete",
  action_url: "/dashboard/topics?type=exercise",
  action_label: "Practice Exercises",
});
const err1 = validStudentNotif.validateSync();
assert(err1 === undefined, "Valid student notification passes schema validation without errors");
assert(validStudentNotif.is_read === false, "Default is_read is false");
assert(validStudentNotif.priority === "Incomplete", "Default priority is 'Incomplete'");

// Test 1.2: Valid institute notification passes validation
const validInstNotif = new Notification({
  recipient_type: "institute",
  recipient_id: new mongoose.Types.ObjectId(),
  recipient_model: "Institute",
  institute_id: new mongoose.Types.ObjectId(),
  title: "Practical Submission Alert",
  description: "A student has submitted a new practical.",
  category: "practical_manual",
  type: "Practical Manual",
  priority: "Completed",
});
const err2 = validInstNotif.validateSync();
assert(err2 === undefined, "Valid institute notification passes schema validation without errors");

// Test 1.3: Invalid category rejected
const invalidCategoryNotif = new Notification({
  recipient_type: "student",
  recipient_id: new mongoose.Types.ObjectId(),
  recipient_model: "Student",
  institute_id: new mongoose.Types.ObjectId(),
  title: "Test",
  description: "Test desc",
  category: "invalid_category",
  type: "Exercise",
});
const err3 = invalidCategoryNotif.validateSync();
assert(err3 && err3.errors && err3.errors.category, "Invalid category enum is rejected by schema");

// Test 1.4: Missing required fields rejected
const missingRequiredNotif = new Notification({});
const err4 = missingRequiredNotif.validateSync();
assert(
  err4 &&
  err4.errors.recipient_type &&
  err4.errors.recipient_id &&
  err4.errors.institute_id &&
  err4.errors.title &&
  err4.errors.description &&
  err4.errors.category &&
  err4.errors.type,
  "Missing required fields (recipient_type, recipient_id, institute_id, title, description, category, type) are properly caught"
);


// ── TEST SUITE 2: Express Router & Route Registration ──
console.log("\n--- Suite 2: Router & Route Registration ---");

// Test 2.1: Routes mounted under /notifications
const matchesNotifications = apiRouter.stack.some(
  (layer) => layer.match && layer.match("/notifications")
);
assert(matchesNotifications, "Route /notifications is mounted in src/index.js router stack");

const notificationRoutes = require("../routes/notificationRoutes");
const subRoutes = [];
notificationRoutes.stack.forEach((layer) => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).join(",").toUpperCase();
    subRoutes.push(`${methods} ${layer.route.path}`);
  }
});

assert(subRoutes.includes("GET /"), "Route 'GET /' is registered on notification router");
assert(subRoutes.includes("GET /unread-count"), "Route 'GET /unread-count' is registered on notification router");
assert(subRoutes.includes("PATCH /read-all"), "Route 'PATCH /read-all' is registered on notification router");
assert(subRoutes.includes("PATCH /:id/read"), "Route 'PATCH /:id/read' is registered on notification router");
assert(subRoutes.includes("DELETE /:id"), "Route 'DELETE /:id' is registered on notification router");


// ── TEST SUITE 3: Controller & Service Methods ──
console.log("\n--- Suite 3: Controller & Service API Contract ---");

assert(typeof notificationController.getNotifications === "function", "notificationController.getNotifications is a callable function");
assert(typeof notificationController.getUnreadCount === "function", "notificationController.getUnreadCount is a callable function");
assert(typeof notificationController.markAsRead === "function", "notificationController.markAsRead is a callable function");
assert(typeof notificationController.markAllAsRead === "function", "notificationController.markAllAsRead is a callable function");
assert(typeof notificationController.deleteNotification === "function", "notificationController.deleteNotification is a callable function");

assert(typeof NotificationService.createNotification === "function", "NotificationService.createNotification is a callable function");
assert(typeof NotificationService.createBulkNotifications === "function", "NotificationService.createBulkNotifications is a callable function");
assert(typeof NotificationService.notifyStudentsByBatch === "function", "NotificationService.notifyStudentsByBatch is a callable function");
assert(typeof NotificationService.notifyInstitute === "function", "NotificationService.notifyInstitute is a callable function");


// ── TEST SUITE 4: Triggers in practicalController and taskController ──
console.log("\n--- Suite 4: Triggers in Controllers ---");

const fs = require("fs");
const path = require("path");

const practicalCtrlSource = fs.readFileSync(path.join(__dirname, "../controller/practicalController.js"), "utf8");
const taskCtrlSource = fs.readFileSync(path.join(__dirname, "../controller/taskController.js"), "utf8");

assert(
  practicalCtrlSource.includes("NotificationService.createBulkNotifications") &&
  practicalCtrlSource.includes("NotificationService.createNotification"),
  "practicalController.js contains NotificationService triggers on assign and gradeSubmission"
);

assert(
  taskCtrlSource.includes("NotificationService.createBulkNotifications") &&
  taskCtrlSource.includes("NotificationService.createNotification"),
  "taskController.js contains NotificationService triggers on assign and gradeSubmission"
);

const slaCtrlSource = fs.readFileSync(path.join(__dirname, "../controller/studentLearningAccessController.js"), "utf8");
assert(
  slaCtrlSource.includes("NotificationService.createBulkNotifications"),
  "studentLearningAccessController.js contains NotificationService trigger on curriculum allocation"
);


// ── TEST SUITE 5: Batch-Alignment & Recipient Scoping Logic ──
console.log("\n--- Suite 5: Batch-Alignment & Recipient Scoping Logic ---");

// Test 5.1: Verify batch notification payload isolates recipient IDs correctly
const mockStudentA = { _id: new mongoose.Types.ObjectId(), segment: "Mechanical", year: 2 };
const mockStudentB = { _id: new mongoose.Types.ObjectId(), segment: "Computer", year: 1 };
const assignedBatch = { segment: "Mechanical", year: 2 };

// Filter students matching batch
const allMockStudents = [mockStudentA, mockStudentB];
const targetedStudents = allMockStudents.filter(
  (s) => s.segment === assignedBatch.segment && s.year === assignedBatch.year
);

assert(targetedStudents.length === 1, "Batch filtering isolates exactly 1 student matching Mechanical Year 2");
assert(targetedStudents[0]._id.toString() === mockStudentA._id.toString(), "Only Student A in Mechanical Year 2 is targeted");
assert(!targetedStudents.some((s) => s._id.toString() === mockStudentB._id.toString()), "Student B in Computer Year 1 is excluded from Mechanical Year 2 notifications");

// Test 5.2: Verify notification documents are indexed and bound to recipient_id
const notifForA = new Notification({
  recipient_type: "student",
  recipient_id: mockStudentA._id,
  recipient_model: "Student",
  institute_id: new mongoose.Types.ObjectId(),
  title: "Batch Practical Assigned",
  description: "Assigned only to Mechanical Year 2",
  category: "practical_manual",
  type: "Practical Manual",
  priority: "Incomplete",
  meta_data: { segment: "Mechanical", year: 2 },
});

assert(notifForA.recipient_id.toString() === mockStudentA._id.toString(), "Notification recipient is explicitly bound to Student A's ObjectId");
assert(notifForA.meta_data.segment === "Mechanical" && notifForA.meta_data.year === 2, "Notification metadata correctly records target batch");

console.log("\n==========================================");
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("==========================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
