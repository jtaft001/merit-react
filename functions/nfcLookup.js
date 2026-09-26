const admin = require("firebase-admin");
const { findStudentForKiosk } = require("./studentLookup");

/**
 * Callable (unauthenticated): look up a student by their NFC sticker UID or
 * their school student ID number.
 * Returns the student's name without writing anything to the database.
 * Used by the kiosk page to confirm the student before showing action buttons.
 */
const nfcLookup = async (request) => {
  const { HttpsError } = require("firebase-functions/v2/https");

  const { nfcId } = request.data || {};

  if (!nfcId || typeof nfcId !== "string" || nfcId.trim() === "") {
    throw new HttpsError("invalid-argument", "nfcId is required.");
  }

  const match = await findStudentForKiosk(admin.firestore(), nfcId);

  if (!match) {
    throw new HttpsError(
      "not-found",
      "Card or student ID not recognized. Please see your instructor."
    );
  }

  const studentName = match.doc.data().name || "Unknown Student";
  return { studentName };
};

module.exports = { nfcLookup };
