const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const License = require("../models/License");
const Institute = require("../models/Institute");
const Session = require("../models/Session");
const Student = require("../models/Student");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const emailService = require("../service/emailService");

function hmacSign(pattern) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(pattern)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
}

function fallbackPattern() {
  return crypto.randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g).join("-");
}

async function fetchLlmPattern() {
  const url = process.env.OPENLLM_URL;
  if (!url) return fallbackPattern();

  try {
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENLLM_MODEL || "llama3",
        messages: [
          {
            role: "user",
            content:
              "Generate a unique license key pattern in XXXX-XXXX-XXXX format using uppercase letters and digits only. Return ONLY the key, nothing else.",
          },
        ],
        max_tokens: 20,
      }),
    });
    const data = await res.json();
    return data.choices[0].message.content.trim().toUpperCase();
  } catch {
    return fallbackPattern();
  }
}

// PUT /api/super-admin/institute/:id/license
const generateBatch = asyncHandler(async (req, res) => {
  const { license_count, start_date, expiry_date, seats_per_license } = req.body;

  if (!license_count || license_count < 1) {
    return sendError(res, 400, false, "license_count must be at least 1.");
  }
  if (!start_date || !expiry_date) {
    return sendError(res, 400, false, "start_date and expiry_date are required.");
  }

  // How many concurrent students each generated license key allows.
  // Defaults to 1 (old behavior — one key = one seat) when not specified.
  const seatsPerLicense = seats_per_license ? Number(seats_per_license) : 1;
  if (!Number.isInteger(seatsPerLicense) || seatsPerLicense < 1) {
    return sendError(res, 400, false, "seats_per_license must be a positive integer.");
  }

  const institute = await Institute.findById(req.params.id).populate(
    "course_id",
    "course_name",
  );
  if (!institute) return sendError(res, 404, false, "Institute not found.");
  if (!institute.is_active) return sendError(res, 400, false, "Institute is inactive.");

  const startDate = new Date(start_date);
  const expiryDate = new Date(expiry_date);

  if (expiryDate <= startDate) {
    return sendError(res, 400, false, "expiry_date must be after start_date.");
  }

  const generatedKeys = [];
  const createdLicenseIds = [];

  for (let i = 1; i <= license_count; i++) {
    const keyIndex = institute.license_count + i;
    const t0 = Date.now();
    const rawPattern = await fetchLlmPattern();
    const sig = hmacSign(rawPattern);
    const licenseKey = `LL-${rawPattern}-${sig}`;
    const licenseCode = `${institute.institute_code}-K${keyIndex}`;

    // Per-seat credentials — user_id shown as login username, plain password shown ONCE
    const userId = `${institute.institute_code}-U${keyIndex}`;
    const plainPassword = `${institute.institute_code}${keyIndex}`;
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const license = await License.create({
      license_key: licenseKey,
      license_code: licenseCode,
      user_id: userId,
      seat_password: hashedPassword,
      key_index: keyIndex,
      institute_id: institute._id,
      purchased_by: req.admin._id,
      total_seats: seatsPerLicense,
      active_sessions: 0,
      start_date: startDate,
      expiry_date: expiryDate,
      duration: Math.ceil((expiryDate - startDate) / 86400000),
      status: "active",
      llm_metadata: {
        llm_used: !!process.env.OPENLLM_URL,
        key_pattern: rawPattern,
        signature: sig,
        time_ms: Date.now() - t0,
      },
    });

    await Institute.findByIdAndUpdate(institute._id, {
      $push: { license_ids: license._id },
    });

    createdLicenseIds.push(license._id);

    generatedKeys.push({
      key_index: keyIndex,
      license_code: licenseCode,
      license_key: licenseKey,
      user_id: userId,
      password: plainPassword, // plain — shown ONCE in this response, never stored in plain
      total_seats: seatsPerLicense,
      status: "active",
    });
  }

  // Update license_count
  await Institute.findByIdAndUpdate(institute._id, {
    $inc: { license_count: license_count },
  });

  // Awaited (not thrown) — sendMail() never rejects, so this can't block/fail generation,
  // but the admin panel needs to know whether the purchase confirmation email actually went out.
  const email_sent = await emailService.sendLicensePurchaseEmail({
    institute,
    courses: institute.course_id,
    licenses: generatedKeys,
  });
  if (email_sent) {
    await License.updateMany(
      { _id: { $in: createdLicenseIds } },
      { $set: { purchase_email_sent_at: new Date() } },
    );
  }

  return sendResponse(res, 201, true, "Licenses generated successfully.", {
    institute_id: institute._id,
    institute_name: institute.institute_name,
    institute_code: institute.institute_code,
    license_count: institute.license_count + license_count,
    seats_per_license: seatsPerLicense,
    total_concurrent_seats: license_count * seatsPerLicense,
    start_date,
    expiry_date,
    licenses: generatedKeys,
    email_sent,
    warning: "Passwords shown ONCE only. Store them securely. They cannot be retrieved again.",
  });
});

// GET /api/super-admin/institute/:id/licenses  (super admin)
// GET /api/institute/me/licenses               (institute self)
const getByInstitute = asyncHandler(async (req, res) => {
  const instituteId = req.params.id || req.institute?._id;
  if (!instituteId) return sendError(res, 400, false, "Institute ID is required.");

  const institute = await Institute.findById(instituteId);
  if (!institute) return sendError(res, 404, false, "Institute not found.");

  // Matched by institute_id (the field every License doc is required to
  // carry) rather than Institute.license_ids — that array is only ever
  // pushed to from generateBatch, so any license created another way
  // (manual seeding, a migration, a future admin tool) would silently be
  // excluded from seat totals if we trusted the array instead.
  const licenses = await License.find({ institute_id: institute._id })
    .sort({ key_index: 1 })
    .select("-__v");

  const studentsUsed = await Student.countDocuments({ institute_id: institute._id });

  // Aggregate seat/expiry summary across every license key the institute
  // owns — mirrors the same total_seats/used_seats math as
  // instituteController.js's getDashboard so the two views never disagree.
  const totalSeats = licenses.reduce((sum, l) => sum + l.total_seats, 0);
  const usedSeats = licenses.reduce((sum, l) => sum + l.active_sessions, 0);

  // "Expiry Date" for the institute as a whole is the soonest upcoming
  // renewal among currently active licenses — the date that actually needs
  // attention. Falls back to the latest expiry across all licenses if none
  // are active (e.g. everything already expired).
  const activeExpiries = licenses
    .filter((l) => l.status === "active" && l.expiry_date)
    .map((l) => new Date(l.expiry_date).getTime());
  const allExpiries = licenses.filter((l) => l.expiry_date).map((l) => new Date(l.expiry_date).getTime());
  const expiryDate = activeExpiries.length
    ? new Date(Math.min(...activeExpiries))
    : allExpiries.length
    ? new Date(Math.max(...allExpiries))
    : null;

  return sendResponse(res, 200, true, "Licenses fetched successfully.", {
    institute_id: institute._id,
    institute_name: institute.institute_name,
    // Derived from the actual license documents found above, not the
    // Institute.license_count counter — that field is only ever incremented
    // inside generateBatch, so it can't be trusted as the source of truth.
    license_count: licenses.length,
    max_students: institute.max_students,
    students_used: studentsUsed,
    total_seats: totalSeats,
    used_seats: usedSeats,
    expiry_date: expiryDate,
    licenses,
  });
});

// POST /api/super-admin/institute/:id/reset-seats
// Resets all stuck active_sessions to 0 and deactivates all active sessions
const resetSeats = asyncHandler(async (req, res) => {
  const institute = await Institute.findById(req.params.id);
  if (!institute) return sendError(res, 404, false, "Institute not found.");

  if (!institute.license_ids || institute.license_ids.length === 0) {
    return sendError(res, 400, false, "This institute has no licenses.");
  }

  // Deactivate all active sessions for this institute's licenses
  const sessionResult = await Session.updateMany(
    {
      license_id: { $in: institute.license_ids },
      is_active: true,
    },
    { $set: { is_active: false } },
  );

  // Reset active_sessions to 0 on all license keys
  const licenseResult = await License.updateMany(
    { _id: { $in: institute.license_ids } },
    { $set: { active_sessions: 0 } },
  );

  return sendResponse(res, 200, true, "Seats reset successfully. All students must login again.", {
    sessions_closed: sessionResult.modifiedCount,
    licenses_reset: licenseResult.modifiedCount,
    institute_id: institute._id,
    institute_name: institute.institute_name,
  });
});

module.exports = { generateBatch, getByInstitute, resetSeats };
