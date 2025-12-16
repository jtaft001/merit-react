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
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);
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
    .where("createdAt", ">=", startDate)
    .where("createdAt", "<=", endDate)
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

    const batch = db.batch();
    totals.forEach((netMs, sid) => {
      const safeId = sid.replace(/\//g, "_");
    const netHours = netMs / 1000 / 60 / 60;
    const paidHours = netHours;
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
      studentName: sid,
      periodId,
      periodEnd: endDate,
      netHours,
      paidHours,
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
    console.log(`Wrote ${totals.size} payroll docs for period ${periodId}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
