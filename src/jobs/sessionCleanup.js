const cron = require("node-cron");

const Session = require("../models/Session");
const License = require("../models/License");

// Runs every 5 minutes — finds expired sessions and frees their license seats
const cleanupExpiredSessions = async () => {
  try {
    const now = new Date();

    const expired = await Session.find(
      { is_active: true, expires_at: { $lt: now } },
      { _id: 1, license_id: 1 },
    ).lean();

    if (!expired.length) return;

    // Batch deactivate all expired sessions
    await Session.updateMany(
      { _id: { $in: expired.map((s) => s._id) } },
      { $set: { is_active: false } },
    );

    // Group by license_id and decrement active_sessions atomically
    const seatMap = {};
    for (const s of expired) {
      const key = s.license_id.toString();
      seatMap[key] = (seatMap[key] || 0) + 1;
    }

    await Promise.all(
      Object.entries(seatMap).map(([id, count]) =>
        License.findByIdAndUpdate(id, [
          {
            $set: {
              active_sessions: {
                $max: [0, { $subtract: ["$active_sessions", count] }],
              },
            },
          },
        ]),
      ),
    );

    console.log(`[Cron] cleanupExpiredSessions: freed ${expired.length} seat(s)`);
  } catch (err) {
    console.error("[Cron] cleanupExpiredSessions error:", err.message);
  }
};

// Runs daily at midnight — marks licenses past expiry_date as expired
const markExpiredLicenses = async () => {
  try {
    const result = await License.updateMany(
      { status: "active", expiry_date: { $lt: new Date() } },
      { $set: { status: "expired" } },
    );
    if (result.modifiedCount > 0) {
      console.log(`[Cron] markExpiredLicenses: expired ${result.modifiedCount} license(s)`);
    }
  } catch (err) {
    console.error("[Cron] markExpiredLicenses error:", err.message);
  }
};

const registerJobs = () => {
  cron.schedule("*/5 * * * *", cleanupExpiredSessions);
  cron.schedule("0 0 * * *", markExpiredLicenses);
  console.log("[Cron] Jobs registered: sessionCleanup (*/5min), licenseExpiry (daily midnight)");
};

module.exports = registerJobs;
