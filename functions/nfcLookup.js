const admin = require("firebase-admin");

/** Strip colons/spaces and uppercase — matches both "04:E7:49:AC" and "04E749AC" */
function normalizeNfcId(id) {
  return id.replace(/[:\s]/g, "").toUpperCase();
}

/**
 * Callable (unauthenticated): look up a student by their NFC sticker UID.
 * Returns the student's name without writing anything to the database.
 * Used by the kiosk page to confirm the card before showing action buttons.
 */
const nfcLookup = async (request) => {
  const { HttpsError } = require("firebase-functions/v2/https");

  const { nfcId } = request.data || {};

  if (!nfcId || typeof nfcId !== "string" || nfcId.trim() === "") {
    throw new HttpsError("invalid-argument", "nfcId is required.");
  }

  const normalized = normalizeNfcId(nfcId);
  const db = admin.firestore();

  const snap = await db
    .collection("students")
    .where("nfcId", "==", normalized)
    .limit(1)
    .get();

  if (snap.empty) {
    throw new HttpsError(
      "not-found",
      "Card not registered. Please see your instructor."
    );
  }

  const studentName = snap.docs[0].data().name || "Unknown Student";
  return { studentName };
};

module.exports = { nfcLookup };
