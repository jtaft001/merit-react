const admin = require("firebase-admin");
const { findStudentForKiosk } = require("./studentLookup");

const VALID_ACTIONS = ["CLOCK IN", "CLOCK OUT", "BREAK START", "BREAK END"];

/**
 * Callable (unauthenticated): record a timeclock event from an NFC card tap or
 * a typed student ID number.
 *
 * Accepts { nfcId, action }. `nfcId` is matched against the student's nfcId
 * (set via the CSV import tool) first, then their school ID number. Writes to
 * the timeclock collection using the Admin SDK.
 */
const nfcClock = async (request) => {
  const { HttpsError } = require("firebase-functions/v2/https");

  const { nfcId, action } = request.data || {};

  if (!nfcId || typeof nfcId !== "string" || nfcId.trim() === "") {
    throw new HttpsError("invalid-argument", "nfcId is required.");
  }

  const normalized = (action || "").toUpperCase().trim();
  if (!VALID_ACTIONS.includes(normalized)) {
    throw new HttpsError(
      "invalid-argument",
      `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}`
    );
  }

  const db = admin.firestore();

  const match = await findStudentForKiosk(db, nfcId);

  if (!match) {
    throw new HttpsError("not-found", "Card or student ID not recognized. Please see your instructor.");
  }

  const studentDoc = match.doc;
  const studentId = studentDoc.id;
  const studentName = studentDoc.data().name || "Unknown Student";

  await db.collection("timeclock").add({
    studentId,
    action: normalized,
    timestamp: admin.firestore.Timestamp.now(),
    source: match.method,
  });

  return { studentName, action: normalized };
};

module.exports = { nfcClock };
