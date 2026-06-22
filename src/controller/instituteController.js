const bcrypt = require("bcryptjs");

const Institute = require("../models/Institute");
const Course = require("../models/Course");
const License = require("../models/License");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const uploadToAws = require("../utils/awsUpload");

// POST /institute
const create = asyncHandler(async (req, res) => {
  const {
    institute_name,
    institute_code,
    email,
    password,
    phone,
    address,
    website,
    max_students,
    course_id,
  } = req.body;

  if (!course_id || (Array.isArray(course_id) && course_id.length === 0)) {
    return sendError(res, 400, false, "At least one course_id is required.");
  }

  // normalize to array — frontend may send a single id or an array
  const courseIds = Array.isArray(course_id) ? course_id : [course_id];

  const courseCount = await Course.countDocuments({ _id: { $in: courseIds }, is_active: true });
  if (courseCount !== courseIds.length) {
    return sendError(res, 404, false, "One or more selected courses not found or are inactive.");
  }

  const existingInstitute = await Institute.findOne({
    $or: [{ email }, { institute_code: institute_code.toUpperCase() }],
  });

  if (existingInstitute) {
    return sendError(
      res,
      409,
      false,
      "Institute with this email or code already exists.",
    );
  }

  let logo = "";
  if (req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `institute_logo_${Date.now()}`,
      folderName: "institutes",
    });

    logo = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const institute = await Institute.create({
    institute_name,
    institute_code: institute_code.toUpperCase(),
    email,
    password: hashedPassword,
    phone,
    address,
    website,
    max_students,
    logo,
    course_id: courseIds,
    role: "institute",
    created_by: req.admin._id,
  });

  return sendResponse(res, 201, true, "Institute created successfully.", {
    id: institute._id,
    institute_name: institute.institute_name,
    institute_code: institute.institute_code,
    email: institute.email,
    logo: institute.logo,
    is_active: institute.is_active,
    license_id: institute.license_id || null,
  });
});

// GET /institute
const getAll = asyncHandler(async (req, res) => {
  const institutes = await Institute.aggregate([
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: "superadmins",
        localField: "created_by",
        foreignField: "_id",
        as: "created_by",
        pipeline: [{ $project: { full_name: 1, email: 1 } }],
      },
    },
    { $unwind: { path: "$created_by", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "licenses",
        localField: "license_id",
        foreignField: "_id",
        as: "license",
        pipeline: [
          {
            $project: {
              license_key: 1,
              status: 1,
              expiry_date: 1,
              total_seats: 1,
              active_sessions: 1,
            },
          },
        ],
      },
    },
    { $unwind: { path: "$license", preserveNullAndEmptyArrays: true } },
    { $project: { password: 0 } },
  ]);

  return sendResponse(
    res,
    200,
    true,
    "Institutes fetched successfully.",
    institutes,
  );
});

// GET /institute/:id
const getOne = asyncHandler(async (req, res) => {
  const { Types } = require("mongoose");

  const [institute] = await Institute.aggregate([
    { $match: { _id: new Types.ObjectId(req.params.id) } },
    {
      $lookup: {
        from: "superadmins",
        localField: "created_by",
        foreignField: "_id",
        as: "created_by",
        pipeline: [{ $project: { full_name: 1, email: 1 } }],
      },
    },
    { $unwind: { path: "$created_by", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "licenses",
        localField: "license_id",
        foreignField: "_id",
        as: "license",
        pipeline: [
          {
            $project: {
              license_key: 1,
              license_code: 1,
              status: 1,
              start_date: 1,
              expiry_date: 1,
              duration: 1,
              total_seats: 1,
              active_sessions: 1,
            },
          },
        ],
      },
    },
    { $unwind: { path: "$license", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "editors",
        localField: "editors",
        foreignField: "_id",
        as: "editors",
        pipeline: [{ $project: { full_name: 1, email: 1 } }],
      },
    },
    { $project: { password: 0 } },
  ]);

  if (!institute) return sendError(res, 404, false, "Institute not found.");

  return sendResponse(res, 200, true, "Institute fetched successfully.", institute);
});

// PUT /institute/:id
const update = asyncHandler(async (req, res) => {
  const institute = await Institute.findById(req.params.id);

  if (!institute) {
    return sendError(res, 404, false, "Institute not found.");
  }

  const {
    institute_name,
    institute_code,
    email,
    address,
    phone,
    website,
    max_students,
    is_active,
  } = req.body;

  if (email || institute_code) {
    const existingInstitute = await Institute.findOne({
      _id: { $ne: req.params.id },
      $or: [
        ...(email ? [{ email: email.toLowerCase() }] : []),
        ...(institute_code ? [{ institute_code: institute_code.toUpperCase() }] : []),
      ],
    });

    if (existingInstitute) {
      return sendError(
        res,
        409,
        false,
        "Institute email or code already exists.",
      );
    }
  }

  if (institute_name !== undefined) institute.institute_name = institute_name;

  if (institute_code !== undefined)
    institute.institute_code = institute_code.toUpperCase();

  if (email !== undefined) institute.email = email.toLowerCase();

  if (address !== undefined) institute.address = address;

  if (phone !== undefined) institute.phone = phone;

  if (website !== undefined) institute.website = website;

  if (max_students !== undefined) institute.max_students = max_students;

  if (is_active !== undefined) institute.is_active = is_active;

  if (req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `institute_logo_${Date.now()}`,
      folderName: "institutes",
    });

    institute.logo = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  await institute.save();

  return sendResponse(res, 200, true, "Institute updated successfully.", institute);
});

// DELETE /institute/:id
const remove = asyncHandler(async (req, res) => {
  const institute = await Institute.findById(req.params.id);

  if (!institute) {
    return sendError(res, 404, false, "Institute not found.");
  }

  institute.is_active = false;
  await institute.save();

  return sendResponse(res, 200, true, "Institute deactivated successfully.");
});

// PUT /institute/:id/toggle-status
const toggleStatus = asyncHandler(async (req, res) => {
  const institute = await Institute.findById(req.params.id);
  if (!institute) return sendError(res, 404, false, "Institute not found.");

  institute.is_active = !institute.is_active;
  await institute.save();

  return sendResponse(
    res,
    200,
    true,
    `Institute ${institute.is_active ? "activated" : "deactivated"} successfully.`,
    { is_active: institute.is_active },
  );
});

// PUT /institute/:id/assign-license
const assignLicense = asyncHandler(async (req, res) => {
  const { license_id } = req.body;

  const license = await License.findById(license_id);
  if (!license) {
    return sendError(res, 404, false, "License not found.");
  }

  if (license.status !== "active") {
    return sendError(res, 400, false, "License is not active.");
  }

  const institute = await Institute.findById(req.params.id);
  if (!institute) {
    return sendError(res, 404, false, "Institute not found.");
  }

  if (license.institute_id.toString() !== institute._id.toString()) {
    return sendError(
      res,
      400,
      false,
      "License does not belong to this institute.",
    );
  }

  if (institute.license_id) {
    return sendError(
      res,
      400,
      false,
      "Institute already has a license assigned.",
    );
  }

  institute.license_id = license._id;
  await institute.save();

  return sendResponse(res, 200, true, "License assigned successfully.", {
    institute_id: institute._id,
    institute_name: institute.institute_name,
    license_id: license._id,
    license_key: license.license_key,
    status: license.status,
  });
});

// POST /institute/login
const login = asyncHandler(async (req, res) => {
  const jwt = require("jsonwebtoken");
  const { email, password } = req.body;

  const institute = await Institute.findOne({ email }).select("+password");
  if (!institute) return sendError(res, 401, false, "Invalid email or password.");

  const isMatch = await bcrypt.compare(password, institute.password);
  if (!isMatch) return sendError(res, 401, false, "Invalid email or password.");

  if (!institute.is_active)
    return sendError(res, 403, false, "Institute account is inactive.");

  const token = jwt.sign(
    { id: institute._id, role: "institute" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN },
  );

  return sendResponse(res, 200, true, "Login successful.", {
    token,
    institute: {
      id: institute._id,
      institute_name: institute.institute_name,
      institute_code: institute.institute_code,
      email: institute.email,
      logo: institute.logo,
      is_active: institute.is_active,
    },
  });
});

// GET /institute/me
const getMe = asyncHandler(async (req, res) => {
  const { Types } = require("mongoose");

  const [institute] = await Institute.aggregate([
    { $match: { _id: new Types.ObjectId(req.institute._id) } },
    {
      $lookup: {
        from: "licenses",
        localField: "license_id",
        foreignField: "_id",
        as: "license",
        pipeline: [
          {
            $project: {
              license_key: 1,
              license_code: 1,
              status: 1,
              start_date: 1,
              expiry_date: 1,
              total_seats: 1,
              active_sessions: 1,
            },
          },
        ],
      },
    },
    { $unwind: { path: "$license", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "editors",
        localField: "editors",
        foreignField: "_id",
        as: "editors",
        pipeline: [{ $project: { full_name: 1, email: 1, profilePhoto: 1 } }],
      },
    },
    { $project: { password: 0 } },
  ]);

  return sendResponse(res, 200, true, "Profile fetched successfully.", institute);
});

// PUT /institute/me
const updateMe = asyncHandler(async (req, res) => {
  const institute = await Institute.findById(req.institute._id);

  const { institute_name, address, phone, website } = req.body;

  if (institute_name !== undefined) institute.institute_name = institute_name;
  if (address !== undefined) institute.address = address;
  if (phone !== undefined) institute.phone = phone;
  if (website !== undefined) institute.website = website;

  if (req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `institute_logo_${Date.now()}`,
      folderName: "institutes",
    });
    institute.logo = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  await institute.save();

  return sendResponse(res, 200, true, "Profile updated successfully.", institute);
});

// POST /institute/logout
const logout = asyncHandler(async (req, res) => {
  return sendResponse(res, 200, true, "Logged out successfully.", null);
});

module.exports = {
  create,
  getAll,
  getOne,
  update,
  remove,
  toggleStatus,
  assignLicense,
  login,
  logout,
  getMe,
  updateMe,
};
