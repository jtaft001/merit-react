const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");

const DEFAULT_HOURLY_RATE = 15;
const DEDUCTION_PER_WARNING = 5;
const REWARD_COLLECTION = "reward_purchases";

const generatePayroll = async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be authenticated to generate payroll."
    );
  }

  const { periodId } = request.data;
  if (!periodId) {
    throw new HttpsError(
      "invalid-argument",
      "periodId is required."
    );
  }

  const db = admin.firestore();

  // Fetch the pay period
  const periodDoc = await db.collection("pay_periods").doc(periodId).get();
  if (!periodDoc.exists) {
    throw new HttpsError("not-found", `Pay period ${periodId} not found.`);
  }

  const period = periodDoc.data();
  const startDate =
    period.startDate?.toDate?.() ?? (period.startDate ? new Date(period.startDate) : null);
  const endDate =
    period.endDate?.toDate?.() ?? (period.endDate ? new Date(period.endDate) : null);
  const hourlyRate =
    typeof period.hourlyRate === "number" ? period.hourlyRate : DEFAULT_HOURLY_RATE;

  if (!startDate || !endDate) {
    throw new HttpsError(
      "failed-precondition",
      `Pay period ${periodId} is missing start or end date.`
    );
  }

  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);

  // Fetch sessions, warnings, and reward purchases for the period
  const [sessionsSnap, warningsSnap, rewardsSnap] = await Promise.all([
    db.collection("sessions")
      .where("dateStr", ">=", startStr)
      .where("dateStr", "<=", endStr)
      .get(),
    db.collection("warnings")
      .where("dateStr", ">=", startStr)
      .where("dateStr", "<=", endStr)
      .get(),
    db.collection(REWARD_COLLECTION)
      .where("status", "==", "approved")
      .where("createdAt", ">=", startDate)
      .where("createdAt", "<=", endDate)
      .get(),
  ]);

  // Aggregate session hours per student
  const totals = new Map();
  sessionsSnap.forEach((doc) => {
    const s = doc.data();
    const sid = s.studentId || "";
    if (!sid) return;
    const netMs = typeof s.netMs === "number" ? s.netMs : 0;
    totals.set(sid, (totals.get(sid) || 0) + netMs);
  });

  // Aggregate warning counts per student
  const warningCounts = new Map();
  warningsSnap.forEach((doc) => {
    const w = doc.data();
    const sid = w.studentId || "";
    if (!sid) return;
    warningCounts.set(sid, (warningCounts.get(sid) || 0) + 1);
  });

  // Aggregate reward deductions per student
  const rewardTotals = new Map();
  const rewardItems = new Map();
  rewardsSnap.forEach((doc) => {
    const r = doc.data();
    const sid = r.studentId || "";
    if (!sid) return;
    const cost = typeof r.cost === "number" ? r.cost : 0;
    rewardTotals.set(sid, (rewardTotals.get(sid) || 0) + cost);
    const arr = rewardItems.get(sid) || [];
    arr.push({ name: r.rewardName || r.rewardId || "Reward", cost });
    rewardItems.set(sid, arr);
  });

  // Write payroll documents
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
  return { count: totals.size, periodId };
};

module.exports = { generatePayroll };
