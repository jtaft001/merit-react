const admin = require("firebase-admin");
const { toDateStr, startOfDayUtc, endOfDayUtc } = require("./dateUtils");

/**
 * Resolve the student Firestore doc for the authenticated caller.
 * Returns { docId, data } or throws an HttpsError.
 *
 * Strategy:
 *  1. Try the doc whose ID == auth.uid (most common — createUser sets this).
 *  2. Fall back to a query on the `authUid` field (legacy records).
 */
async function resolveStudent(db, uid, HttpsError) {
  // 1. Direct ID match
  const direct = await db.collection("students").doc(uid).get();
  if (direct.exists) return { docId: uid, data: direct.data() };

  // 2. Field query fallback
  const snap = await db
    .collection("students")
    .where("authUid", "==", uid)
    .limit(1)
    .get();
  if (!snap.empty)
    return { docId: snap.docs[0].id, data: snap.docs[0].data() };

  throw new HttpsError("not-found", "Student record not found.");
}

// ─── getMyClockStatus ──────────────────────────────────────────────────────────
/**
 * Callable (authenticated): return the student's current clock status and
 * today's event list.
 *
 * Returns:
 *   {
 *     studentId: string,
 *     name: string,
 *     currentStatus: 'in' | 'break' | 'out',
 *     events: Array<{ id, action, timestamp, source }>
 *   }
 */
const getMyClockStatus = async (request) => {
  const { HttpsError } = require("firebase-functions/v2/https");

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const db = admin.firestore();
  const { docId, data: studentData } = await resolveStudent(
    db,
    request.auth.uid,
    HttpsError
  );

  // Today's window, anchored to the local calendar day (not UTC)
  const now = new Date();
  const todayStr = toDateStr(now);
  const dayStart = startOfDayUtc(todayStr);
  const dayEnd   = endOfDayUtc(todayStr);

  const evSnap = await db
    .collection("timeclock")
    .where("studentId", "==", docId)
    .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(dayStart))
    .where("timestamp", "<", admin.firestore.Timestamp.fromDate(dayEnd))
    .orderBy("timestamp", "asc")
    .get();

  const events = evSnap.docs.map((doc) => {
    const d = doc.data();
    return {
      id:        doc.id,
      action:    d.action || "",
      timestamp: d.timestamp?.toDate?.()?.toISOString() ?? null,
      source:    d.source || "manual",
    };
  });

  // Derive current status from the last relevant event
  let currentStatus = "out";
  for (const ev of events) {
    const a = (ev.action || "").toUpperCase();
    if (a.includes("CLOCK IN"))    currentStatus = "in";
    if (a.includes("BREAK START")) currentStatus = "break";
    if (a.includes("BREAK END"))   currentStatus = "in";
    if (a.includes("CLOCK OUT"))   currentStatus = "out";
  }

  return {
    studentId:     docId,
    name:          studentData.name || "Unknown",
    currentStatus,
    events,
  };
};

// ─── getMyAttendance ───────────────────────────────────────────────────────────
/**
 * Callable (authenticated): return the student's session history.
 *
 * Optional input: { days: number }  (default 30, max 90)
 *
 * Returns:
 *   {
 *     sessions: Array<{
 *       dateStr, clockIn, clockOut,
 *       grossMs, netMs, breakMs, breakCount
 *     }>,
 *     totalNetMs: number,
 *     totalDays: number,
 *   }
 */
const getMyAttendance = async (request) => {
  const { HttpsError } = require("firebase-functions/v2/https");

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const db = admin.firestore();
  const { docId } = await resolveStudent(db, request.auth.uid, HttpsError);

  const days = Math.min(
    90,
    Math.max(1, parseInt(request.data?.days ?? 30, 10) || 30)
  );

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = toDateStr(since);

  const sessSnap = await db
    .collection("sessions")
    .where("studentId", "==", docId)
    .where("dateStr", ">=", sinceStr)
    .orderBy("dateStr", "desc")
    .limit(days)
    .get();

  let totalNetMs = 0;

  const sessions = sessSnap.docs.map((doc) => {
    const d = doc.data();
    const netMs = d.netMs ?? 0;
    totalNetMs += netMs;
    return {
      dateStr:    d.dateStr,
      clockIn:    d.clockIn?.toDate?.()?.toISOString()  ?? null,
      clockOut:   d.clockOut?.toDate?.()?.toISOString() ?? null,
      grossMs:    d.grossMs   ?? null,
      netMs:      d.netMs     ?? null,
      breakMs:    d.breakMs   ?? 0,
      breakCount: d.breakCount ?? 0,
    };
  });

  return {
    sessions,
    totalNetMs,
    totalDays: sessions.length,
  };
};

module.exports = { getMyClockStatus, getMyAttendance };
