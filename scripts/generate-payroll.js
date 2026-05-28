// Generate payroll docs from sessions for all pay periods ending on/before today,
// and (optionally) for a specific periodId. Uses deterministic doc ids: <studentId>_<periodId>.
//
// Usage:
//   NODE_PATH=functions/node_modules node scripts/generate-payroll.js           # backfill up to today
//   NODE_PATH=functions/node_modules node scripts/generate-payroll.js <periodId>  # single period
//
// Requirements:
// - ADC: gcloud auth application-default login
// - Quota project: gcloud auth application-default set-quota-project merit-ems
// - pay_periods populated (ids should match the end-date string if you used the seeder)
// - sessions populated with dateStr (YYYY-MM-DD) and netMs fields

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const require = createRequire(path.resolve(__filename, "..", "..", "functions", "package.json"));
let admin;
try {
  admin = require("firebase-admin");
} catch (err) {
  console.error("firebase-admin not found in functions/node_modules. Run `cd functions && npm install` first.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "merit-ems",
});

const db = admin.firestore();
const DEFAULT_HOURLY_RATE = 15;
const DEDUCTION_PER_WARNING = 5;
const REWARD_COLLECTION = "reward_purchases";
const TIMEZONE = "America/Los_Angeles";

// Local-date helpers — keep in sync with functions/dateUtils.js. All dateStr
// keys are YYYY-MM-DD in TIMEZONE, not UTC.
function toDateStr(date, tz = TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}
function tzOffsetMs(date, tz = TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour, Number(map.minute), Number(map.second));
  return asUtc - date.getTime();
}
function startOfDayUtc(dateStr, tz = TIMEZONE) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  return new Date(guess - tzOffsetMs(new Date(guess), tz));
}
function endOfDayUtc(dateStr, tz = TIMEZONE) {
  return new Date(startOfDayUtc(dateStr, tz).getTime() + 24 * 60 * 60 * 1000);
}

async function main() {
  const argPeriod = process.argv[2];
  let periodsQuery = db.collection("pay_periods");

  if (argPeriod) {
    periodsQuery = periodsQuery.where(admin.firestore.FieldPath.documentId(), "==", argPeriod);
  } else {
    const todayStr = new Date().toISOString().slice(0, 10);
    // endDate is a timestamp; compare against a Date object
    const todayDate = new Date(todayStr + "T00:00:00");
    periodsQuery = periodsQuery.where("endDate", "<=", todayDate);
  }

  const periodsSnap = await periodsQuery.get();
  if (periodsSnap.empty) {
    console.log("No pay periods found for criteria.");
    return;
  }

  for (const periodDoc of periodsSnap.docs) {
    const periodId = periodDoc.id;
    const period = periodDoc.data() || {};
    const startDate =
      period.startDate?.toDate?.() ?? (period.startDate ? new Date(period.startDate) : null);
    const endDate = period.endDate?.toDate?.() ?? (period.endDate ? new Date(period.endDate) : null);
    const hourlyRate =
      typeof period.hourlyRate === "number" ? period.hourlyRate : DEFAULT_HOURLY_RATE;
    if (!startDate || !endDate) {
      console.warn(`Skipping ${periodId}: missing start/end`);
      continue;
    }
    const startStr = toDateStr(startDate);
    const endStr = toDateStr(endDate);
    console.log(`Processing period ${periodId}: ${startStr} to ${endStr} @ $${hourlyRate}/hr`);

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

  const rewardsSnap = await db
    .collection(REWARD_COLLECTION)
    .where("status", "==", "approved")
    .where("createdAt", ">=", startOfDayUtc(startStr))
    .where("createdAt", "<", endOfDayUtc(endStr))
    .get();

  const studentsSnap = await db.collection("students").get();
  const nameById = new Map();
  studentsSnap.forEach((doc) => {
    const sd = doc.data();
    nameById.set(doc.id, sd.name || `${sd.firstName || ""} ${sd.lastName || ""}`.trim() || doc.id);
  });

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

  const rewardTotals = new Map();
  const rewardItems = new Map();
  rewardsSnap.forEach((doc) => {
    const r = doc.data();
    const sid = r.studentId || "";
    if (!sid) return;
    const cost = typeof r.cost === "number" ? r.cost : 0;
    rewardTotals.set(sid, (rewardTotals.get(sid) || 0) + cost);
    const arr = rewardItems.get(sid) || [];
    arr.push({
      name: r.rewardName || r.rewardId || "Reward",
      cost,
    });
    rewardItems.set(sid, arr);
  });

    const allStudentIds = new Set([
      ...totals.keys(),
      ...warningCounts.keys(),
      ...rewardTotals.keys(),
    ]);

    const batch = db.batch();
    allStudentIds.forEach((sid) => {
      const netMs = totals.get(sid) || 0;
      const safeId = sid.replace(/\//g, "_");
    const netHours = netMs / 1000 / 60 / 60;
    const totalPay = Math.round(netHours * hourlyRate * 100) / 100;
    const warningCount = warningCounts.get(sid) || 0;
    const warningDeduction = warningCount * DEDUCTION_PER_WARNING;
    const rewardDeduction = rewardTotals.get(sid) || 0;
    const deductions = warningDeduction + rewardDeduction;
    const netPay = Math.round((totalPay - deductions) * 100) / 100;
    const docId = `${safeId}_${periodId}`;
    const ref = db.collection("payroll").doc(docId);
    batch.set(ref, {
      studentId: sid,
      studentName: nameById.get(sid) || sid,
      periodId,
      periodEnd: endDate,
      netHours,
      totalPay,
      netPay,
      deductions,
      warningCount,
      warningDeduction,
      rewardDeduction,
      rewardItems: rewardItems.get(sid) || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
    await batch.commit();
    console.log(`Wrote ${allStudentIds.size} payroll docs for period ${periodId}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
