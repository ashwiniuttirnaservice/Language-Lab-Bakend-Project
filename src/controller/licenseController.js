const crypto = require("crypto");

const License = require("../models/License");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

function generateLicenseKey(instituteId) {
  const payload = `${instituteId}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  const hash = crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(payload)
    .digest("hex")
    .toUpperCase()
    .slice(0, 32);
  return hash.match(/.{4}/g).join("-"); // XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
}

function generateLicenseCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase(); // e.g. 3FA2C1D0
}

// POST /license/generate
const generate = asyncHandler(async (req, res) => {
  const { institute_id, total_seats, duration, start_date } = req.body;

  const startDate = start_date ? new Date(start_date) : new Date();
  const expiryDate = new Date(startDate);
  expiryDate.setDate(expiryDate.getDate() + duration);

  const license = await License.create({
    license_key: generateLicenseKey(institute_id),
    license_code: generateLicenseCode(),
    institute_id,
    purchased_by: req.admin._id,
    total_seats: total_seats ?? 5,
    duration,
    start_date: startDate,
    expiry_date: expiryDate,
  });

  return sendResponse(
    res,
    201,
    true,
    "License generated successfully.",
    license,
  );
});

// GET /license?instituteId=&status=
const getAll = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.instituteId) filter.institute_id = req.query.instituteId;
  if (req.query.status) filter.status = req.query.status;

  const licenses = await License.find(filter)
    .populate("institute_id", "institute_name institute_code")
    .populate("purchased_by", "full_name email")
    .sort({ createdAt: 1 });

  return sendResponse(
    res,
    200,
    true,
    "Licenses fetched successfully.",
    licenses,
  );
});

// GET /license/:id
const getOne = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id)
    .populate("institute_id", "name")
    .populate("purchased_by", "full_name email");

  if (!license) return sendError(res, 404, false, "License not found.");

  return sendResponse(res, 200, true, "License fetched successfully.", license);
});

// PUT /license/:id/activate
const activate = asyncHandler(async (req, res) => {
  const license = await License.findByIdAndUpdate(
    req.params.id,
    { status: "active" },
    { new: true },
  );

  if (!license) return sendError(res, 404, false, "License not found.");

  return sendResponse(
    res,
    200,
    true,
    "License activated successfully.",
    license,
  );
});

// PUT /license/:id/suspend
const suspend = asyncHandler(async (req, res) => {
  const license = await License.findByIdAndUpdate(
    req.params.id,
    { status: "suspended" },
    { new: true },
  );

  if (!license) return sendError(res, 404, false, "License not found.");

  return sendResponse(
    res,
    200,
    true,
    "License suspended successfully.",
    license,
  );
});

// PUT /license/:id/expire
const expire = asyncHandler(async (req, res) => {
  const license = await License.findByIdAndUpdate(
    req.params.id,
    { status: "expired" },
    { new: true },
  );

  if (!license) return sendError(res, 404, false, "License not found.");

  return sendResponse(res, 200, true, "License expired successfully.", license);
});

// PUT /license/:id/seats
const updateSeats = asyncHandler(async (req, res) => {
  const { total_seats } = req.body;

  const license = await License.findById(req.params.id);

  if (!license) return sendError(res, 404, false, "License not found.");

  if (total_seats < license.active_sessions) {
    return sendError(
      res,
      400,
      false,
      `Cannot reduce seats below active sessions (${license.active_sessions}).`,
    );
  }

  license.total_seats = total_seats;
  await license.save();

  return sendResponse(res, 200, true, "Seats updated successfully.", license);
});

// PUT /license/:id/renew
const renew = asyncHandler(async (req, res) => {
  const { start_date, expiry_date } = req.body;

  if (!start_date || !expiry_date) {
    return sendError(res, 400, false, "start_date and expiry_date are required.");
  }

  const start = new Date(start_date);
  const expiry = new Date(expiry_date);

  if (expiry <= start) {
    return sendError(res, 400, false, "expiry_date must be after start_date.");
  }

  const duration = Math.ceil((expiry - start) / 86400000);

  const license = await License.findByIdAndUpdate(
    req.params.id,
    { start_date: start, expiry_date: expiry, duration, status: "active" },
    { new: true },
  );

  if (!license) return sendError(res, 404, false, "License not found.");

  return sendResponse(res, 200, true, "License renewed successfully.", license);
});

// PUT /license/:id — generic admin edit (status / dates / seats in one call,
// as opposed to the single-purpose activate/suspend/expire/renew/seats actions above)
const update = asyncHandler(async (req, res) => {
  const { status, start_date, expiry_date, total_seats } = req.body;

  const license = await License.findById(req.params.id);
  if (!license) return sendError(res, 404, false, "License not found.");

  if (total_seats !== undefined) {
    if (total_seats < license.active_sessions) {
      return sendError(
        res,
        400,
        false,
        `Cannot reduce seats below active sessions (${license.active_sessions}).`,
      );
    }
    license.total_seats = total_seats;
  }

  if (start_date !== undefined) license.start_date = new Date(start_date);
  if (expiry_date !== undefined) license.expiry_date = new Date(expiry_date);
  if (status !== undefined) license.status = status;

  if (license.expiry_date <= license.start_date) {
    return sendError(res, 400, false, "expiry_date must be after start_date.");
  }

  license.duration = Math.ceil(
    (license.expiry_date - license.start_date) / 86400000,
  );

  await license.save();

  return sendResponse(res, 200, true, "License updated successfully.", license);
});

// DELETE /license/:id
const remove = asyncHandler(async (req, res) => {
  const license = await License.findByIdAndDelete(req.params.id);

  if (!license) return sendError(res, 404, false, "License not found.");

  return sendResponse(res, 200, true, "License deleted successfully.");
});

module.exports = {
  generate,
  getAll,
  getOne,
  activate,
  suspend,
  expire,
  renew,
  updateSeats,
  update,
  remove,
};
