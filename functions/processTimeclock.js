const admin = require("firebase-admin");
const { toDateStr, startOfDayUtc, endOfDayUtc } = require("./dateUtils");
const { buildResolver } = require("./studentIdentity");

/**
 * Derives a session from an ordered list of timeclock events for one day.
 * Returns null if there is no clock-in event.
 *
 * Supports MULTIPLE clock-in/out stints in a single day: each completed
 * (in -> out) stint's worked time is accumulated, so a student who clocks
 * fully out and back in is paid for both stints rather than only the last.
 *
 * Fields:
 *   clockIn  = first clock-in of the day
 *   clockOut = last clock-out of the day (null if currently still clocked in)
 *   grossMs  = summed worked time across COMPLETED stints (null if none closed)
 *   breakMs  = summed break time across completed stints
 *   netMs    = grossMs - breakMs (null if no completed stint)
 *   breakCount = number of breaks taken
 *   open     = true if the student is still clocked in (no closing clock-out)
 */
function deriveSession(events, studentId, dateStr) {
  let firstClockIn = null;
  let lastClockOut = null;
  let totalGrossMs = 0;
  let totalBreakMs = 0;
  let breakCount = 0;

  // per-stint state
  let inSession = false;
  let stintStart = null;
  let inBreak = false;
  let breakStart = null;
  let stintBreakMs = 0;

  const closeStint = (endTs) => {
    if (!inSession || !stintStart) return;
    if (inBreak && breakStart) {
      stintBreakMs += Math.max(0, endTs.getTime() - breakStart.getTime());
      inBreak = false;
      breakStart = null;
    }
    totalGrossMs += Math.max(0, endTs.getTime() - stintStart.getTime());
    totalBreakMs += stintBreakMs;
    lastClockOut = endTs;
    inSession = false;
    stintStart = null;
    stintBreakMs = 0;
  };

  events.forEach((ev) => {
    const action = (ev.action || "").toUpperCase();
    if (action.includes("CLOCK IN")) {
      // Ignore a duplicate clock-in while already in a stint (keeps the
      // earliest start); a real second stint only begins after a clock-out.
      if (!inSession) {
        inSession = true;
        stintStart = ev.timestamp;
        inBreak = false;
        breakStart = null;
        stintBreakMs = 0;
        if (!firstClockIn) firstClockIn = ev.timestamp;
      }
    } else if (action.includes("BREAK START")) {
      if (inSession && !inBreak) {
        inBreak = true;
        breakStart = ev.timestamp;
        breakCount += 1;
      }
    } else if (action.includes("BREAK END")) {
      if (inSession && inBreak && breakStart) {
        stintBreakMs += Math.max(0, ev.timestamp.getTime() - breakStart.getTime());
        inBreak = false;
        breakStart = null;
      }
    } else if (action.includes("CLOCK OUT")) {
      closeStint(ev.timestamp);
    }
  });

  if (!firstClockIn) return null;

  const hasCompleted = lastClockOut !== null;

  return {
    studentId,
    dateStr,
    clockIn: admin.firestore.Timestamp.fromDate(firstClockIn),
    clockOut: lastClockOut
      ? admin.firestore.Timestamp.fromDate(lastClockOut)
      : null,
    grossMs: hasCompleted ? totalGrossMs : null,
    breakMs: totalBreakMs,
    netMs: hasCompleted ? Math.max(0, totalGrossMs - totalBreakMs) : null,
    breakCount,
    open: inSession,
  };
}

/**
 * Firestore trigger (Gen 1): whenever a new timeclock document is created,
 * re-derive and upsert the session for that student+day.
 * Signature: (snap, context) for Gen 1 triggers.
 */
const onTimeclockEvent = async (snap, _context) => {
  const db = admin.firestore();
  const data = snap.data();
  if (!data) return;

  const rawStudentId = data.studentId;
  if (!rawStudentId) return;

  // Resolve to the canonical students doc ID so Form (name) and NFC (doc id)
  // events for the same person land in the same session. Falls back to the
  // raw value for clock-in users who have no student account.
  const resolve = await buildResolver(db);
  const studentId = resolve(rawStudentId);

  const rawTs = data.timestamp;
  const timestamp =
    rawTs?.toDate?.() ?? (rawTs ? new Date(rawTs) : new Date());
  const dateStr = toDateStr(timestamp);

  // Query all timeclock events for this *local* day (small result set).
  // The window is the UTC span of the local calendar day, so an evening
  // Pacific tap is grouped with the rest of that day rather than the next.
  const dayStart = startOfDayUtc(dateStr);
  const dayEnd = endOfDayUtc(dateStr);

  const daySnap = await db
    .collection("timeclock")
    .where("timestamp", ">=", dayStart)
    .where("timestamp", "<", dayEnd)
    .orderBy("timestamp", "asc")
    .get();

  // Resolve every event's studentId to canonical, then keep this student's.
  const events = daySnap.docs
    .map((doc) => {
      const d = doc.data();
      const ts = d.timestamp?.toDate?.() ?? new Date(d.timestamp);
      return {
        action: d.action || "",
        timestamp: ts,
        studentId: resolve(d.studentId),
      };
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

  if (!request.auth.token.staff) {
    throw new HttpsError(
      "permission-denied",
      "Only admins can backfill sessions."
    );
  }

  const db = admin.firestore();

  // Optionally wipe existing (derived) sessions first so re-keying a student
  // from name -> canonical doc ID doesn't leave a stale duplicate session.
  // Sessions are fully derived from timeclock, so this is safe to rebuild.
  const wipe = request.data?.wipe === true;
  let deleted = 0;
  if (wipe) {
    const existing = await db.collection("sessions").get();
    let delBatch = db.batch();
    let delCount = 0;
    for (const doc of existing.docs) {
      delBatch.delete(doc.ref);
      delCount += 1;
      deleted += 1;
      if (delCount >= 400) {
        await delBatch.commit();
        delBatch = db.batch();
        delCount = 0;
      }
    }
    if (delCount > 0) await delBatch.commit();
  }

  // Resolve any raw studentId (Form name / NFC doc id) to canonical doc ID.
  const resolve = await buildResolver(db);

  // Fetch all timeclock events (up to 10,000)
  const snap = await db
    .collection("timeclock")
    .orderBy("timestamp", "asc")
    .limit(10000)
    .get();

  // Group events by canonical studentId + dateStr
  const grouped = new Map();
  snap.docs.forEach((doc) => {
    const d = doc.data();
    const studentId = resolve(d.studentId);
    if (!studentId) return;
    const rawTs = d.timestamp;
    const timestamp =
      rawTs?.toDate?.() ?? (rawTs ? new Date(rawTs) : null);
    if (!timestamp) return;
    const dateStr = toDateStr(timestamp);
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

  console.log(`Backfill complete: ${count} sessions written${wipe ? `, ${deleted} deleted first` : ""}.`);
  return { count, deleted, wiped: wipe };
};

module.exports = { onTimeclockEvent, backfillSessions, deriveSession };
