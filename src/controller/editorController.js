const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Types } = require("mongoose");

const Editor = require("../models/Editor");
const Institute = require("../models/Institute");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const uploadToAws = require("../utils/awsUpload");

const signToken = (id) =>
  jwt.sign({ id, role: "editor" }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

// ── Admin: create editor ──────────────────────────────────────────────────────
const create = asyncHandler(async (req, res) => {
  const { full_name, email, password, phone, assigned_institutes } = req.body;

  const existing = await Editor.findOne({ email });
  if (existing) return sendError(res, 409, false, "Email already registered.");

  let profilePhoto = "";
  if (req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `editor_${Date.now()}`,
      folderName: "editors",
    });
    profilePhoto = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const editor = await Editor.create({
    full_name,
    email,
    password: hashedPassword,
    phone,
    profilePhoto,
    assigned_institutes: assigned_institutes || [],
    created_by: req.admin._id,
  });

  if (assigned_institutes?.length) {
    await Institute.updateMany(
      { _id: { $in: assigned_institutes } },
      { $addToSet: { editors: editor._id } },
    );
  }

  return sendResponse(res, 201, true, "Editor created successfully.", {
    id: editor._id,
    full_name: editor.full_name,
    email: editor.email,
    role: editor.role,
    profilePhoto: editor.profilePhoto,
  });
});

// ── Admin: get all editors ────────────────────────────────────────────────────
const getAll = asyncHandler(async (req, res) => {
  const editors = await Editor.aggregate([
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
        from: "institutes",
        localField: "assigned_institutes",
        foreignField: "_id",
        as: "assigned_institutes",
        pipeline: [{ $project: { institute_name: 1, institute_code: 1 } }],
      },
    },
    { $project: { password: 0 } },
  ]);

  return sendResponse(res, 200, true, "Editors fetched successfully.", editors);
});

// ── Admin: get one editor ─────────────────────────────────────────────────────
const getOne = asyncHandler(async (req, res) => {
  const [editor] = await Editor.aggregate([
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
        from: "institutes",
        localField: "assigned_institutes",
        foreignField: "_id",
        as: "assigned_institutes",
        pipeline: [{ $project: { institute_name: 1, institute_code: 1, logo: 1 } }],
      },
    },
    { $project: { password: 0 } },
  ]);

  if (!editor) return sendError(res, 404, false, "Editor not found.");

  return sendResponse(res, 200, true, "Editor fetched successfully.", editor);
});

// ── Admin: update editor ──────────────────────────────────────────────────────
const update = asyncHandler(async (req, res) => {
  const editor = await Editor.findById(req.params.id);
  if (!editor) return sendError(res, 404, false, "Editor not found.");

  const { full_name, phone, status, is_active } = req.body;

  if (full_name !== undefined) editor.full_name = full_name;
  if (phone !== undefined) editor.phone = phone;
  if (status !== undefined) editor.status = status;
  if (is_active !== undefined) editor.is_active = is_active;

  if (req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `editor_${Date.now()}`,
      folderName: "editors",
    });
    editor.profilePhoto = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  await editor.save();

  return sendResponse(res, 200, true, "Editor updated successfully.", editor);
});

// ── Admin: soft delete ────────────────────────────────────────────────────────
const remove = asyncHandler(async (req, res) => {
  const editor = await Editor.findById(req.params.id);
  if (!editor) return sendError(res, 404, false, "Editor not found.");

  editor.is_active = false;
  editor.status = "inactive";
  await editor.save();

  return sendResponse(res, 200, true, "Editor deactivated successfully.");
});

// ── Admin: toggle status ──────────────────────────────────────────────────────
const toggleStatus = asyncHandler(async (req, res) => {
  const editor = await Editor.findById(req.params.id);
  if (!editor) return sendError(res, 404, false, "Editor not found.");

  editor.is_active = !editor.is_active;
  editor.status = editor.is_active ? "active" : "inactive";
  await editor.save();

  return sendResponse(
    res,
    200,
    true,
    `Editor ${editor.is_active ? "activated" : "deactivated"} successfully.`,
    { is_active: editor.is_active, status: editor.status },
  );
});

// ── Admin: assign institutes ──────────────────────────────────────────────────
const assignInstitute = asyncHandler(async (req, res) => {
  const { institute_ids } = req.body;

  const editor = await Editor.findById(req.params.id);
  if (!editor) return sendError(res, 404, false, "Editor not found.");

  const objectIds = institute_ids.map((id) => new Types.ObjectId(id));

  editor.assigned_institutes = [
    ...new Set([
      ...editor.assigned_institutes.map((id) => id.toString()),
      ...institute_ids,
    ]),
  ].map((id) => new Types.ObjectId(id));

  await editor.save();

  await Institute.updateMany(
    { _id: { $in: objectIds } },
    { $addToSet: { editors: editor._id } },
  );

  return sendResponse(res, 200, true, "Institutes assigned successfully.", {
    assigned_institutes: editor.assigned_institutes,
  });
});

// ── Editor: login ─────────────────────────────────────────────────────────────
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const editor = await Editor.findOne({ email }).select("+password");
  if (!editor) return sendError(res, 401, false, "Invalid email or password.");

  const isMatch = await bcrypt.compare(password, editor.password);
  if (!isMatch) return sendError(res, 401, false, "Invalid email or password.");

  if (!editor.is_active) return sendError(res, 403, false, "Account is inactive.");

  editor.last_login = new Date();
  await editor.save();

  const token = signToken(editor._id);

  return sendResponse(res, 200, true, "Login successful.", {
    token,
    editor: {
      id: editor._id,
      full_name: editor.full_name,
      email: editor.email,
      role: editor.role,
      profilePhoto: editor.profilePhoto,
      last_login: editor.last_login,
    },
  });
});

// ── Editor: get own profile ───────────────────────────────────────────────────
const getMe = asyncHandler(async (req, res) => {
  const [editor] = await Editor.aggregate([
    { $match: { _id: new Types.ObjectId(req.editor._id) } },
    {
      $lookup: {
        from: "institutes",
        localField: "assigned_institutes",
        foreignField: "_id",
        as: "assigned_institutes",
        pipeline: [{ $project: { institute_name: 1, institute_code: 1, logo: 1 } }],
      },
    },
    { $project: { password: 0 } },
  ]);

  return sendResponse(res, 200, true, "Profile fetched successfully.", editor);
});

// ── Editor: update own profile ────────────────────────────────────────────────
const updateMe = asyncHandler(async (req, res) => {
  const editor = await Editor.findById(req.editor._id);

  const { full_name, phone } = req.body;

  if (full_name !== undefined) editor.full_name = full_name;
  if (phone !== undefined) editor.phone = phone;

  if (req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `editor_${Date.now()}`,
      folderName: "editors",
    });
    editor.profilePhoto = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  await editor.save();

  return sendResponse(res, 200, true, "Profile updated successfully.", editor);
});

// ── Editor: change own password ───────────────────────────────────────────────
const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  const editor = await Editor.findById(req.editor._id).select("+password");

  const isMatch = await bcrypt.compare(current_password, editor.password);
  if (!isMatch) return sendError(res, 401, false, "Current password is incorrect.");

  editor.password = await bcrypt.hash(new_password, 12);
  await editor.save();

  return sendResponse(res, 200, true, "Password changed successfully.");
});

module.exports = {
  create,
  getAll,
  getOne,
  update,
  remove,
  toggleStatus,
  assignInstitute,
  login,
  getMe,
  updateMe,
  changePassword,
};
