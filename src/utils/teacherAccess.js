const { Types } = require("mongoose");
const Course = require("../models/Course");

/**
 * Resolves teacher.assigned_courses (which can contain course names, course codes, or ObjectIds)
 * into an array of MongoDB Course ObjectIds.
 *
 * @param {Object} teacher - req.teacher object
 * @returns {Promise<Array<Types.ObjectId>|null>} - null if not a teacher (unrestricted),
 *                                                   [] if teacher has no courses assigned,
 *                                                   [ObjectId, ...] if teacher has assigned courses.
 */
async function getTeacherAssignedCourseIds(teacher) {
  if (!teacher) return null; // null means no faculty restrictions (e.g. Institute Admin)

  const rawCourses = teacher.assigned_courses;
  if (!Array.isArray(rawCourses) || rawCourses.length === 0) {
    return []; // Faculty with no courses assigned -> strictly 0 courses allowed
  }

  const validObjectIds = rawCourses
    .filter((c) => Types.ObjectId.isValid(c))
    .map((c) => new Types.ObjectId(c));

  const stringNamesOrCodes = rawCourses.map((c) => c.toString().trim());

  const matchedCourses = await Course.find({
    $or: [
      { _id: { $in: validObjectIds } },
      { course_name: { $in: stringNamesOrCodes } },
      { course_code: { $in: stringNamesOrCodes } },
    ],
  }).select("_id");

  return matchedCourses.map((c) => c._id);
}

/**
 * Checks whether a given courseId is in the teacher's allowed assignedCourseIds array.
 */
function isCourseAllowed(courseId, allowedCourseIds) {
  if (allowedCourseIds === null) return true; // unrestricted
  if (!courseId) return false;
  const targetId = courseId._id ? courseId._id.toString() : courseId.toString();
  return allowedCourseIds.some((id) => id.toString() === targetId);
}

/**
 * Builds a query object or filter fragment for scoping student queries by teacher.
 * Returns null if not a teacher (unrestricted institute admin).
 * If teacher has no departments and no batches, returns { _id: { $in: [] } }.
 * If teacher has department-scoped batches [{ department, batch }], returns { $or: [...] }.
 * If teacher has departments and/or batches (array of numbers), returns { segment, year } criteria.
 */
function buildTeacherStudentScope(teacher) {
  if (!teacher) return null;

  const hasDepartments = Array.isArray(teacher.assigned_departments) && teacher.assigned_departments.length > 0;
  const hasBatches = Array.isArray(teacher.assigned_batches) && teacher.assigned_batches.length > 0;

  if (!hasDepartments && !hasBatches) {
    return { _id: { $in: [] } };
  }

  const scopedBatchPairs = (teacher.assigned_batches || []).filter(
    (b) => typeof b === "object" && b !== null && (b.department || b.segment)
  );

  if (scopedBatchPairs.length > 0) {
    return {
      $or: scopedBatchPairs.map((b) => ({
        segment: b.department || b.segment,
        year: Number(b.batch ?? b.year),
      })),
    };
  }

  const filter = {};
  if (hasDepartments) {
    filter.segment = { $in: teacher.assigned_departments };
  }
  if (hasBatches) {
    const years = teacher.assigned_batches
      .map((b) => (typeof b === "object" && b !== null ? Number(b.batch ?? b.year) : Number(b)))
      .filter((y) => !isNaN(y));
    if (years.length > 0) {
      filter.year = { $in: years };
    }
  }
  return filter;
}

/**
 * Checks whether a given batch (year) and optional department (segment) is allowed for a teacher.
 */
function isBatchAllowed(teacher, department, batch) {
  if (!teacher) return true;
  const hasBatches = Array.isArray(teacher.assigned_batches) && teacher.assigned_batches.length > 0;
  if (!hasBatches) return true;

  const targetBatch = Number(batch);
  return teacher.assigned_batches.some((b) => {
    if (typeof b === "object" && b !== null) {
      const dept = b.department || b.segment;
      const y = Number(b.batch ?? b.year);
      return (!dept || !department || dept === department) && y === targetBatch;
    }
    return Number(b) === targetBatch;
  });
}

module.exports = {
  getTeacherAssignedCourseIds,
  isCourseAllowed,
  buildTeacherStudentScope,
  isBatchAllowed,
};
