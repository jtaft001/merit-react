/**
 * Firebase Functions for MERIT EMS
 * - ingestFormEvent: HTTP endpoint to receive Google Form rows and persist as events
 * - rebuildSessions: HTTP endpoint to derive sessions and warnings from recent events
 *
 * NOTE:
 * - Deploy with: firebase deploy --only functions
 * - Add an Apps Script on the Form response sheet to POST to ingestFormEvent.
 * - Consider adding indexes on events.timestamp for ordering.
 */

const functions = require("firebase-functions/v2");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK once.
admin.initializeApp();
const db = admin.firestore();

/**
 * Ingest a Google Form submission into the events collection.
 * Expected body: { student, timestamp, action }
 */
exports.ingestFormEvent = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const { student, timestamp, action } = req.body || {};
  if (!student || !timestamp || !action) {
    return res.status(400).send("Missing fields: student, timestamp, action");
  }

  const ts = new Date(timestamp);
  if (Number.isNaN(ts.getTime())) {
    return res.status(400).send("Invalid timestamp");
  }

  const actionUpper = String(action).toUpperCase();

  await db.collection("timeclock").add({
    studentId: String(student).trim(),
    timestamp: ts,
    action: actionUpper,
    source: "form",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return res.status(200).send("ok");
});

/**
 * Rebuild sessions and warnings from recent events.
 * Query param: days (optional) to control lookback window, default 30.
 */
exports.rebuildSessions = functions.https.onRequest(async (req, res) => {
  const daysBack = Number(req.query.days) || 30;
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const eventsSnap = await db
    .collection("timeclock")
    .where("timestamp", ">=", since)
    .orderBy("timestamp")
    .get();

  const grouped = new Map();
  eventsSnap.forEach((doc) => {
    const ev = doc.data();
    const ts = ev.timestamp?.toDate ? ev.timestamp.toDate() : new Date(ev.timestamp);
    if (!ts || Number.isNaN(ts.getTime())) return;
    const dateStr = ts.toISOString().slice(0, 10);
    const key = `${ev.studentId}||${dateStr}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ ...ev, ts });
  });

  const sessions = [];
  const warnings = [];

  for (const [key, events] of grouped.entries()) {
    const [studentId, dateStr] = key.split("||");
    events.sort((a, b) => a.ts - b.ts);

    let inSession = false;
    let sessionStart = null;
    let inBreak = false;
    let breakStart = null;
    let totalBreakMs = 0;
    let breakCount = 0;

    events.forEach((ev) => {
      const type = classifyAction(ev.action);
      const ts = ev.ts;

      if (type === "CLOCK_IN") {
        inSession = true;
        sessionStart = ts;
        inBreak = false;
        breakStart = null;
        totalBreakMs = 0;
        breakCount = 0;
      } else if (type === "BREAK_START") {
        breakCount += 1;
        if (inSession && !inBreak) {
          inBreak = true;
          breakStart = ts;
        }
      } else if (type === "BREAK_END") {
        if (inSession && inBreak && breakStart) {
          totalBreakMs += Math.max(0, ts - breakStart);
          inBreak = false;
          breakStart = null;
        }
      } else if (type === "CLOCK_OUT") {
        if (inSession && sessionStart) {
          if (inBreak && breakStart) {
            totalBreakMs += Math.max(0, ts - breakStart);
          }
          const grossMs = Math.max(0, ts - sessionStart);
          const netMs = Math.max(0, grossMs - totalBreakMs);
          sessions.push({
            studentId,
            dateStr,
            clockIn: sessionStart,
            clockOut: ts,
            grossMs,
            breakMs: totalBreakMs,
            netMs,
            breakCount,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          warnings.push({
            studentId,
            dateStr,
            issue: "Clock Out Without Clock In",
            endTs: ts,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        inSession = false;
        sessionStart = null;
        inBreak = false;
        breakStart = null;
        totalBreakMs = 0;
        breakCount = 0;
      }
    });

    if (inSession && sessionStart) {
      warnings.push({
        studentId,
        dateStr,
        issue: "Open Session (No Clock Out)",
        startTs: sessionStart,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    if (inBreak && breakStart) {
      warnings.push({
        studentId,
        dateStr,
        issue: "Open Break (No Break End)",
        startTs: breakStart,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  // Persist results
  const batch = db.batch();
  sessions.forEach((s) => {
    const ref = db.collection("sessions").doc();
    batch.set(ref, s);
  });
  warnings.forEach((w) => {
    const ref = db.collection("warnings").doc();
    batch.set(ref, w);
  });
  await batch.commit();

  return res.status(200).send({
    processedGroups: grouped.size,
    sessionsWritten: sessions.length,
    warningsWritten: warnings.length,
    daysBack,
  });
});

function classifyAction(action) {
  const a = String(action || "").toUpperCase();
  if (a.includes("CLOCK IN")) return "CLOCK_IN";
  if (a.includes("CLOCK OUT")) return "CLOCK_OUT";
  if (a.includes("START")) return "BREAK_START";
  if (a.includes("END")) return "BREAK_END";
  return "OTHER";
}
