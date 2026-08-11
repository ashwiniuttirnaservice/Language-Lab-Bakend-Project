const StudentLearningAccess = require("../models/StudentLearningAccess");

// Backs the "Student Learning Access" feature: institutes can optionally
// restrict which topics/subtopics of a downloaded course a department+batch
// of students can see (see studentLearningAccessController.js). Nothing
// changes for an institute that never configures any of this — content
// stays visible exactly as before (see the null-return contract below).
//
// scopeMatch narrows WHAT's being access-controlled (e.g. { course_id } for
// topics, { topic_id } for subtopics). idField is the field on
// StudentLearningAccess to collect ids from ("topic_id" for a single id,
// "subtopic_ids" for an array).
//
// Returns:
//   - null            → this scope has NO access-control records at all for
//                        this institute — caller should show everything,
//                        unrestricted (backward compatible default).
//   - Set<string>      → this scope IS access-controlled — only these ids
//                        (granted to this exact student's segment+year) may
//                        be shown. An empty Set means "show nothing" (this
//                        student's department/batch wasn't granted here).
const getGrantedIds = async ({ instituteId, segment, year, scopeMatch, idField }) => {
  const isConfigured = await StudentLearningAccess.exists({
    institute_id: instituteId,
    is_active: true,
    ...scopeMatch,
  });
  if (!isConfigured) return null;

  const grants = await StudentLearningAccess.find({
    institute_id: instituteId,
    is_active: true,
    segment,
    year,
    ...scopeMatch,
  }).select(idField);

  const ids = new Set();
  for (const grant of grants) {
    const value = grant[idField];
    if (Array.isArray(value)) {
      value.forEach((v) => ids.add(v.toString()));
    } else if (value) {
      ids.add(value.toString());
    }
  }
  return ids;
};

module.exports = { getGrantedIds };
