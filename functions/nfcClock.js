const admin = require("firebase-admin");

const VALID_ACTIONS = ["CLOCK IN", "CLOCK OUT", "BREAK START", "BREAK END"];

/**
 * Callable (unauthenticated): record a timeclock event from an NFC card tap.
 *
 * Accepts { nfcId, action }.
 * Looks up the student by their nfcId field (set via the CSV import tool),
 * then writes to the timeclock collection using the Admin SDK.
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

  // Look up student by their assigned NFC sticker ID
  const snap = await db
    .collection("students")
    .where("nfcId", "==", nfcId.trim())
    .limit(1)
    .get();

  if (snap.empty) {
    throw new HttpsError("not-found", "NFC card not registered. Please see your instructor.");
  }

  const studentDoc = snap.docs[0];
  const studentId = studentDoc.id;
  const studentName = studentDoc.data().name || "Unknown Student";

  await db.collection("timeclock").add({
    studentId,
    action: normalized,
    timestamp: admin.firestore.Timestamp.now(),
    source: "nfc",
  });

  return { studentName, action: normalized };
};

module.exports = { nfcClock };
