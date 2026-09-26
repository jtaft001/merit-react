/**
 * Shared student lookups for the public kiosks (time clock + hall pass) and
 * the student-ID sign-in.
 *
 * The school's ID number lives in `studentNumber`. Students created by the old
 * bulk-add script stored it under `studentId` instead, so we fall back to that
 * field until those docs are backfilled (scripts/backfill-student-numbers.js).
 */

/** Strip colons/spaces and uppercase — matches both "04:E7:49:AC" and "04E749AC" */
function normalizeNfcId(id) {
  return String(id).replace(/[:\s]/g, "").toUpperCase();
}

const isDroppedDoc = (doc) => String(doc.data().status || "").toLowerCase() === "dropped";

async function firstActive(db, field, value) {
  const snap = await db.collection("students").where(field, "==", value).limit(5).get();
  return snap.docs.find((d) => !isDroppedDoc(d)) || null;
}

/**
 * Find an active student by their school ID number. Returns the students
 * DocumentSnapshot or null.
 */
async function findStudentBySchoolId(db, raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  return (await firstActive(db, "studentNumber", value)) || (await firstActive(db, "studentId", value));
}

/**
 * Find a student by whatever the kiosk received: an NFC card UID first (the
 * reader types it), then a typed school ID number. Returns
 * { doc, method: "nfc" | "student-id" } or null.
 */
async function findStudentForKiosk(db, raw) {
  const value = String(raw || "").trim();
  if (!value) return null;

  const byCard = await db.collection("students").where("nfcId", "==", normalizeNfcId(value)).limit(1).get();
  if (!byCard.empty) return { doc: byCard.docs[0], method: "nfc" };

  const bySchoolId = await findStudentBySchoolId(db, value);
  if (bySchoolId) return { doc: bySchoolId, method: "student-id" };
  return null;
}

module.exports = { normalizeNfcId, findStudentBySchoolId, findStudentForKiosk };
