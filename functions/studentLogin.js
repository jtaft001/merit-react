const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const { findStudentBySchoolId } = require("./studentLookup");

/**
 * Callable (unauthenticated): resolve a school student ID number to the email
 * on the student's sign-in account, so the login page can accept
 * "student ID + password". The password is still checked by Firebase Auth on
 * the client — this only maps the ID to the account's email.
 */
const resolveStudentLogin = async (request) => {
  const raw = (request.data && request.data.studentNumber) || "";
  const studentNumber = String(raw).trim();
  if (!studentNumber) throw new HttpsError("invalid-argument", "Student ID is required.");

  const doc = await findStudentBySchoolId(admin.firestore(), studentNumber);
  const s = doc ? doc.data() : null;
  if (!s || !s.authUid) {
    throw new HttpsError("not-found", "Student ID or password is incorrect.");
  }

  // Prefer the Auth record's email in case the roster copy is stale.
  try {
    const user = await admin.auth().getUser(s.authUid);
    if (user.email) return { email: user.email };
  } catch (err) {
    console.warn("resolveStudentLogin: auth lookup failed", s.authUid, err.code || err);
  }
  if (s.email) return { email: s.email };
  throw new HttpsError("not-found", "Student ID or password is incorrect.");
};

module.exports = { resolveStudentLogin };
