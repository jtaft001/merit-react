const admin = require("firebase-admin");

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

  const db = admin.firestore();

  const snap = await db
    .collection("students")
    .where("nfcId", "==", nfcId.trim())
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
