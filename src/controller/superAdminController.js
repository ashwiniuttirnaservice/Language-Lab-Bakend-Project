const jwt = require("jsonwebtoken");

const SuperAdmin = require("../models/SuperAdmin");
const uploadToAws = require("../utils/awsUpload");

const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

const signToken = (id) => {
  return jwt.sign(
    {
      id,
      role: "super_admin",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN,
    },
  );
};

const register = asyncHandler(async (req, res) => {
  const { full_name, email, password, phone } = req.body;

  const existing = await SuperAdmin.findOne({
    email,
  });

  if (existing) {
    return sendError(res, 409, false, "Email already registered.");
  }

  let profileImage = "";

  if (req.file) {
    const uploadedFile = await uploadToAws({
      file: req.file,
      fileName: `super_admin_${Date.now()}`,
      folderName: "super-admin",
    });

    profileImage = uploadedFile?.cdnUrl || uploadedFile?.fullS3URL || "";
  }

  const admin = await SuperAdmin.create({
    full_name,
    email,
    password,
    phone,
    profileImage,
  });

  const token = signToken(admin._id);

  return sendResponse(res, 201, true, "Super Admin registered successfully.", {
    token,
    admin: {
      id: admin._id,
      full_name: admin.full_name,
      email: admin.email,
      role: admin.role,
      profileImage: admin.profileImage,
    },
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const admin = await SuperAdmin.findOne({
    email,
  }).select("+password");

  if (!admin) {
    return sendError(res, 401, false, "Invalid email or password.");
  }

  const isMatch = await admin.comparePassword(password);

  if (!isMatch) {
    return sendError(res, 401, false, "Invalid email or password.");
  }

  if (!admin.is_active) {
    return sendError(res, 403, false, "Account is inactive.");
  }

  admin.last_login = new Date();

  await admin.save();

  const token = signToken(admin._id);

  return sendResponse(res, 200, true, "Login successful.", {
    token,
    admin: {
      id: admin._id,
      full_name: admin.full_name,
      email: admin.email,
      role: admin.role,
      profileImage: admin.profileImage,
      last_login: admin.last_login,
    },
  });
});

const getProfile = asyncHandler(async (req, res) => {
  const admin = await SuperAdmin.findById(req.admin._id);

  if (!admin) {
    return sendError(res, 404, false, "Super Admin not found.");
  }

  return sendResponse(res, 200, true, "Profile fetched successfully.", admin);
});

const updateProfile = asyncHandler(async (req, res) => {
  const admin = await SuperAdmin.findById(req.admin._id);

  if (!admin) {
    return sendError(res, 404, false, "Super Admin not found.");
  }

  if (req.body.full_name) {
    admin.full_name = req.body.full_name;
  }

  if (req.body.phone) {
    admin.phone = req.body.phone;
  }

  if (req.file) {
    const uploadedFile = await uploadToAws({
      file: req.file,
      fileName: `super_admin_${Date.now()}`,
      folderName: "super-admin",
    });

    admin.profileImage = uploadedFile?.cdnUrl || uploadedFile?.fullS3URL || "";
  }

  await admin.save();

  return sendResponse(res, 200, true, "Profile updated successfully.", admin);
});

const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  const admin = await SuperAdmin.findById(req.admin._id).select("+password");

  if (!admin) {
    return sendError(res, 404, false, "Super Admin not found.");
  }

  const isMatch = await admin.comparePassword(current_password);

  if (!isMatch) {
    return sendError(res, 401, false, "Current password is incorrect.");
  }

  admin.password = new_password;

  await admin.save();

  return sendResponse(res, 200, true, "Password changed successfully.");
});

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
};
