const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const License = require("../models/License");
const Institute = require("../models/Institute");
const Session = require("../models/Session");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

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
  const { license_count, start_date, expiry_date } = req.body;

  if (!license_count || license_count < 1) {
    return sendError(res, 400, false, "license_count must be at least 1.");
  }
  if (!start_date || !expiry_date) {
    return sendError(res, 400, false, "start_date and expiry_date are required.");
  }

  const institute = await Institute.findById(req.params.id);
  if (!institute) return sendError(res, 404, false, "Institute not found.");
  if (!institute.is_active) return sendError(res, 400, false, "Institute is inactive.");

  const startDate = new Date(start_date);
  const expiryDate = new Date(expiry_date);

  if (expiryDate <= startDate) {
    return sendError(res, 400, false, "expiry_date must be after start_date.");
  }

  const generatedKeys = [];

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
      total_seats: 1,
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

    generatedKeys.push({
      key_index: keyIndex,
      license_code: licenseCode,
      license_key: licenseKey,
      user_id: userId,
      password: plainPassword, // plain — shown ONCE in this response, never stored in plain
      status: "active",
    });
  }

  // Update license_count
  await Institute.findByIdAndUpdate(institute._id, {
    $inc: { license_count: license_count },
  });

  return sendResponse(res, 201, true, "Licenses generated successfully.", {
    institute_id: institute._id,
    institute_name: institute.institute_name,
    institute_code: institute.institute_code,
    license_count: institute.license_count + license_count,
    start_date,
    expiry_date,
    licenses: generatedKeys,
    warning: "Passwords shown ONCE only. Store them securely. They cannot be retrieved again.",
  });
});

// GET /api/super-admin/institute/:id/licenses
const getByInstitute = asyncHandler(async (req, res) => {
  const institute = await Institute.findById(req.params.id);
  if (!institute) return sendError(res, 404, false, "Institute not found.");

  const licenses = await License.find({
    _id: { $in: institute.license_ids },
  })
    .sort({ key_index: 1 })
    .select("-__v");

  return sendResponse(res, 200, true, "Licenses fetched successfully.", {
    institute_id: institute._id,
    institute_name: institute.institute_name,
    license_count: institute.license_count,
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
