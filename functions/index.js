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

const DEFAULT_HOURLY_RATE = 15;
const PAYROLL_LOOKBACK_DAYS = 3; // how far back to search for ended pay periods in the scheduled job
const DEDUCTION_PER_WARNING = 5;

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
 * Query param: days (optional) to control lookback window, default 180.
 * Idempotent: uses deterministic doc IDs (studentId_date) for sessions and
 * studentId_date_issue_timestamp for warnings to avoid duplicates on rerun.
 */
exports.rebuildSessions = functions.https.onRequest(async (req, res) => {
  const daysBack = Number(req.query.days) || 180;
  const result = await rebuildSessionsCore(daysBack);
  return res.status(200).send(result);
});

/**
 * Scheduled daily rebuild at 4:00 PM America/Los_Angeles (PST/PDT aware)
 * with a short lookback to catch late arrivals.
 */
exports.rebuildSessionsScheduled = functions.scheduler.onSchedule(
  "0 16 * * *",
  { timeZone: "America/Los_Angeles" },
  async () => {
    const lookbackDays = 2; // adjust if you expect longer delays
    await rebuildSessionsCore(lookbackDays);
  }
);

/**
 * Scheduled payroll generation once daily.
 * Looks for pay periods that ended within the last PAYROLL_LOOKBACK_DAYS
 * and writes deterministic payroll docs (studentId_periodId) so reruns are safe.
 */
exports.generatePayrollScheduled = functions.scheduler.onSchedule(
  "15 2 * * *",
  { timeZone: "America/Los_Angeles" },
  async () => {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - PAYROLL_LOOKBACK_DAYS);
    windowStart.setHours(0, 0, 0, 0);

    const periodsSnap = await db
      .collection("pay_periods")
      .where("endDate", ">=", windowStart)
      .where("endDate", "<=", now)
      .get();

    if (periodsSnap.empty) {
      return;
    }

    for (const periodDoc of periodsSnap.docs) {
      await generatePayrollForPeriod(periodDoc.id, periodDoc.data());
    }
  }
);

async function rebuildSessionsCore(daysBack) {
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

  // Persist results with deterministic IDs to avoid duplicates.
  const batch = db.batch();
  sessions.forEach((s) => {
    const docId = `${s.studentId}_${s.dateStr}`;
    const ref = db.collection("sessions").doc(docId);
    batch.set(ref, s);
  });
  warnings.forEach((w) => {
    const stamp =
      (w.startTs && w.startTs.getTime && w.startTs.getTime()) ||
      (w.startTs instanceof Date && w.startTs.getTime()) ||
      (w.endTs && w.endTs.getTime && w.endTs.getTime()) ||
      (w.endTs instanceof Date && w.endTs.getTime()) ||
      Date.now();
    const safeIssue = String(w.issue || "warning").replace(/\s+/g, "_");
    const docId = `${w.studentId}_${w.dateStr}_${safeIssue}_${stamp}`;
    const ref = db.collection("warnings").doc(docId);
    batch.set(ref, w);
  });
  await batch.commit();

  return {
    processedGroups: grouped.size,
    sessionsWritten: sessions.length,
    warningsWritten: warnings.length,
    daysBack,
  };
}

function classifyAction(action) {
  const a = String(action || "").toUpperCase();
  if (a.includes("CLOCK IN")) return "CLOCK_IN";
  if (a.includes("CLOCK OUT")) return "CLOCK_OUT";
  if (a.includes("START")) return "BREAK_START";
  if (a.includes("END")) return "BREAK_END";
  return "OTHER";
}

async function generatePayrollForPeriod(periodId, periodData) {
  const startDate = toDate(periodData?.startDate);
  const endDate = toDate(periodData?.endDate);
  if (!startDate || !endDate) {
    console.warn(`Skipping payroll for ${periodId}: missing start/end date`);
    return;
  }

  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);
  const hourlyRate =
    typeof periodData?.hourlyRate === "number" ? periodData.hourlyRate : DEFAULT_HOURLY_RATE;

  const sessionsSnap = await db
    .collection("sessions")
    .where("dateStr", ">=", startStr)
    .where("dateStr", "<=", endStr)
    .get();

  const warningsSnap = await db
    .collection("warnings")
    .where("dateStr", ">=", startStr)
    .where("dateStr", "<=", endStr)
    .get();

  const totals = new Map();
  sessionsSnap.forEach((doc) => {
    const s = doc.data();
    const sid = s.studentId || "";
    if (!sid) return;
    const netMs = typeof s.netMs === "number" ? s.netMs : 0;
    totals.set(sid, (totals.get(sid) || 0) + netMs);
  });

  const warningCounts = new Map();
  warningsSnap.forEach((doc) => {
    const w = doc.data();
    const sid = w.studentId || "";
    if (!sid) return;
    warningCounts.set(sid, (warningCounts.get(sid) || 0) + 1);
  });

  if (!totals.size) {
    console.log(`No sessions found for pay period ${periodId}`);
    return;
  }

  const batch = db.batch();
  totals.forEach((netMs, sid) => {
    const safeId = String(sid).replace(/\//g, "_");
    const netHours = netMs / 1000 / 60 / 60;
    const paidHours = netHours;
    const totalPay = Math.round(netHours * hourlyRate * 100) / 100;
    const warningCount = warningCounts.get(sid) || 0;
    const deductions = warningCount * DEDUCTION_PER_WARNING;
    const netPay = Math.round((totalPay - deductions) * 100) / 100;
    const docId = `${safeId}_${periodId}`;
    const ref = db.collection("payroll").doc(docId);
    batch.set(ref, {
      studentId: sid,
      studentName: sid,
      periodId,
      periodEnd: endDate,
      netHours,
      paidHours,
      totalPay,
      netPay,
      deductions,
      warningCount,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
  console.log(`Wrote ${totals.size} payroll docs for period ${periodId}`);
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value.toDate) return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
