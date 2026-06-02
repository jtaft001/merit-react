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
 * Detects timeclock anomalies for a student+day.
 * Each returned anomaly generates a $1 auto-warning.
 *
 * Anomaly types:
 *   "open"         — clocked in, no clock-out
 *   "no_clockin"   — clock-out event with no preceding clock-in
 *   "zero_duration" — clock-in and clock-out at the exact same time
 */
function detectAnomalies(events, session) {
  const anomalies = [];

  const hasClockIn = events.some((ev) =>
    (ev.action || "").toUpperCase().includes("CLOCK IN")
  );
  const hasClockOut = events.some((ev) =>
    (ev.action || "").toUpperCase().includes("CLOCK OUT")
  );

  if (hasClockOut && !hasClockIn) {
    anomalies.push({ type: "no_clockin", issue: "No clock-in" });
  }

  if (session) {
    if (session.open) {
      anomalies.push({ type: "open", issue: "No clock-out" });
    }
    if (!session.open && session.grossMs === 0) {
      anomalies.push({ type: "zero_duration", issue: "Same-time in/out" });
    }
  }

  return anomalies;
}

const WARN_TYPES = ["open", "no_clockin", "zero_duration"];

/**
 * Idempotently writes or deletes the three auto-warning slots for a
 * student+day. Deleting a slot that doesn't exist is a Firestore no-op.
 */
async function syncAutoWarnings(db, studentId, dateStr, anomalies) {
  const safeId = studentId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const batch = db.batch();
  for (const type of WARN_TYPES) {
    const ref = db
      .collection("warnings")
      .doc(`${safeId}_${dateStr}_${type}`);
    const detected = anomalies.find((a) => a.type === type);
    if (detected) {
      batch.set(
        ref,
        {
          studentId,
          dateStr,
          issue: detected.issue,
          type: "auto",
          amount: 1,
          startTs: null,
          endTs: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      batch.delete(ref);
    }
  }
  await batch.commit();
}

/**
 * Firestore trigger (Gen 1): whenever a new timeclock document is created,
 * re-derive and upsert the session for that student+day, then sync
 * auto-warnings based on detected anomalies.
 */
const onTimeclockEvent = async (snap, _context) => {
  const db = admin.firestore();
  const data = snap.data();
  if (!data) return;

  const rawStudentId = data.studentId;
  if (!rawStudentId) return;

  const resolve = await buildResolver(db);
  const studentId = resolve(rawStudentId);

  const rawTs = data.timestamp;
  const timestamp =
    rawTs?.toDate?.() ?? (rawTs ? new Date(rawTs) : new Date());
  const dateStr = toDateStr(timestamp);

  const dayStart = startOfDayUtc(dateStr);
  const dayEnd = endOfDayUtc(dateStr);

  const daySnap = await db
    .collection("timeclock")
    .where("timestamp", ">=", dayStart)
    .where("timestamp", "<", dayEnd)
    .orderBy("timestamp", "asc")
    .get();

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
  const safeId = studentId.replace(/[^a-zA-Z0-9_-]/g, "_");

  if (session) {
    const docId = `${safeId}_${dateStr}`;
    const sessionRef = db.collection("sessions").doc(docId);
    const existing = await sessionRef.get();
    await sessionRef.set(
      {
        ...session,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(existing.exists
          ? {}
          : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );
    console.log(`Session upserted: ${docId}`);
  }

  const anomalies = detectAnomalies(events, session);
  await syncAutoWarnings(db, studentId, dateStr, anomalies);
};

/**
 * Callable: backfill sessions and auto-warnings for all timeclock events.
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

  const resolve = await buildResolver(db);

  const snap = await db
    .collection("timeclock")
    .orderBy("timestamp", "asc")
    .limit(10000)
    .get();

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

  grouped.forEach((g) => {
    g.events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  });

  // Single pass: sessions + auto-warnings together.
  // Max 4 ops per group (1 session + 3 warning slots); flush at 400 to stay
  // well under the 500-write batch limit.
  let count = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const [, g] of grouped) {
    const session = deriveSession(g.events, g.studentId, g.dateStr);
    const safeId = g.studentId.replace(/[^a-zA-Z0-9_-]/g, "_");

    if (session) {
      const docId = `${safeId}_${g.dateStr}`;
      batch.set(
        db.collection("sessions").doc(docId),
        {
          ...session,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      batchCount += 1;
      count += 1;
    }

    const anomalies = detectAnomalies(g.events, session);
    for (const type of WARN_TYPES) {
      const warnRef = db
        .collection("warnings")
        .doc(`${safeId}_${g.dateStr}_${type}`);
      const detected = anomalies.find((a) => a.type === type);
      if (detected) {
        batch.set(
          warnRef,
          {
            studentId: g.studentId,
            dateStr: g.dateStr,
            issue: detected.issue,
            type: "auto",
            amount: 1,
            startTs: null,
            endTs: null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        batch.delete(warnRef);
      }
      batchCount += 1;
    }

    if (batchCount >= 400) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) await batch.commit();

  console.log(
    `Backfill complete: ${count} sessions written${wipe ? `, ${deleted} deleted first` : ""}.`
  );
  return { count, deleted, wiped: wipe };
};

module.exports = { onTimeclockEvent, backfillSessions, deriveSession };
