const admin = require("firebase-admin");

/**
 * Derives a session from an ordered list of timeclock events.
 * Returns null if there is no clock-in event.
 */
function deriveSession(events, studentId, dateStr) {
  let inSession = false;
  let sessionStart = null;
  let clockInTs = null;
  let clockOutTs = null;
  let inBreak = false;
  let breakStart = null;
  let totalBreakMs = 0;
  let breakCount = 0;
  let grossMs = 0;
  let netMs = 0;

  events.forEach((ev) => {
    const action = (ev.action || "").toUpperCase();
    if (action.includes("CLOCK IN")) {
      inSession = true;
      sessionStart = ev.timestamp;
      clockInTs = ev.timestamp;
      clockOutTs = null;
      inBreak = false;
      breakStart = null;
      totalBreakMs = 0;
      breakCount = 0;
    } else if (action.includes("BREAK START")) {
      if (inSession && !inBreak) {
        inBreak = true;
        breakStart = ev.timestamp;
        breakCount += 1;
      }
    } else if (action.includes("BREAK END")) {
      if (inSession && inBreak && breakStart) {
        totalBreakMs += Math.max(
          0,
          ev.timestamp.getTime() - breakStart.getTime()
        );
        inBreak = false;
        breakStart = null;
      }
    } else if (action.includes("CLOCK OUT")) {
      if (inSession && sessionStart) {
        if (inBreak && breakStart) {
          totalBreakMs += Math.max(
            0,
            ev.timestamp.getTime() - breakStart.getTime()
          );
          inBreak = false;
          breakStart = null;
        }
        grossMs = Math.max(0, ev.timestamp.getTime() - sessionStart.getTime());
        netMs = Math.max(0, grossMs - totalBreakMs);
        clockOutTs = ev.timestamp;
      }
      inSession = false;
    }
  });

  if (!clockInTs) return null;

  return {
    studentId,
    dateStr,
    clockIn: admin.firestore.Timestamp.fromDate(clockInTs),
    clockOut: clockOutTs
      ? admin.firestore.Timestamp.fromDate(clockOutTs)
      : null,
    grossMs: clockOutTs ? grossMs : null,
    breakMs: totalBreakMs,
    netMs: clockOutTs ? netMs : null,
    breakCount,
  };
}

/**
 * Firestore trigger: whenever a new timeclock document is created,
 * re-derive and upsert the session for that student+day.
 */
const onTimeclockEvent = async (event) => {
  const db = admin.firestore();
  const data = event.data?.data();
  if (!data) return;

  const studentId = data.studentId;
  if (!studentId) return;

  const rawTs = data.timestamp;
  const timestamp =
    rawTs?.toDate?.() ?? (rawTs ? new Date(rawTs) : new Date());
  const dateStr = timestamp.toISOString().slice(0, 10);

  // Query all timeclock events for this day (small result set)
  const dayStart = new Date(dateStr + "T00:00:00.000Z");
  const dayEnd = new Date(dateStr + "T23:59:59.999Z");

  const snap = await db
    .collection("timeclock")
    .where("timestamp", ">=", dayStart)
    .where("timestamp", "<=", dayEnd)
    .orderBy("timestamp", "asc")
    .get();

  // Filter to this student in memory
  const events = snap.docs
    .map((doc) => {
      const d = doc.data();
      const ts = d.timestamp?.toDate?.() ?? new Date(d.timestamp);
      return { action: d.action || "", timestamp: ts, studentId: d.studentId };
    })
    .filter((ev) => ev.studentId === studentId);

  const session = deriveSession(events, studentId, dateStr);
  if (!session) return;

  const docId = `${studentId.replace(/[^a-zA-Z0-9_-]/g, "_")}_${dateStr}`;
  await db.collection("sessions").doc(docId).set(
    {
      ...session,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`Session upserted: ${docId}`);
};

/**
 * Callable: backfill sessions for all timeclock events.
 * Call once from the admin UI to recover all missing sessions since Dec 12.
 */
const backfillSessions = async (request) => {
  const { HttpsError } = require("firebase-functions/v2/https");

  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be authenticated to backfill sessions."
    );
  }

  const db = admin.firestore();

  // Fetch all timeclock events (up to 10,000)
  const snap = await db
    .collection("timeclock")
    .orderBy("timestamp", "asc")
    .limit(10000)
    .get();

  // Group events by studentId + dateStr
  const grouped = new Map();
  snap.docs.forEach((doc) => {
    const d = doc.data();
    const studentId = d.studentId;
    if (!studentId) return;
    const rawTs = d.timestamp;
    const timestamp =
      rawTs?.toDate?.() ?? (rawTs ? new Date(rawTs) : null);
    if (!timestamp) return;
    const dateStr = timestamp.toISOString().slice(0, 10);
    const key = `${studentId}__${dateStr}`;
    if (!grouped.has(key)) grouped.set(key, { studentId, dateStr, events: [] });
    grouped.get(key).events.push({ action: d.action || "", timestamp });
  });

  // Sort each group's events by timestamp
  grouped.forEach((g) => {
    g.events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  });

  // Derive sessions and batch-write
  let count = 0;
  const BATCH_SIZE = 400;
  let batch = db.batch();
  let batchCount = 0;

  for (const [, g] of grouped) {
    const session = deriveSession(g.events, g.studentId, g.dateStr);
    if (!session) continue;

    const docId = `${g.studentId.replace(/[^a-zA-Z0-9_-]/g, "_")}_${g.dateStr}`;
    const ref = db.collection("sessions").doc(docId);
    batch.set(
      ref,
      {
        ...session,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    batchCount += 1;
    count += 1;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) await batch.commit();

  console.log(`Backfill complete: ${count} sessions written.`);
  return { count };
};

module.exports = { onTimeclockEvent, backfillSessions };
