const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const { toDateStr, startOfDayUtc, endOfDayUtc } = require("./dateUtils");
const { buildResolverFromDocs } = require("./studentIdentity");

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

  if (!request.auth.token.staff) {
    throw new HttpsError(
      "permission-denied",
      "Only admins can generate payroll."
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

  const startStr = toDateStr(startDate);
  const endStr = toDateStr(endDate);

  // Reward purchases are filtered by their createdAt instant; align the window
  // to the local calendar days [startStr 00:00, endStr 24:00) so a late-day
  // purchase on the last day of the period is still counted.
  const rewardStart = startOfDayUtc(startStr);
  const rewardEnd = endOfDayUtc(endStr);

  // Fetch sessions, warnings, reward purchases, and students for the period
  const [sessionsSnap, warningsSnap, rewardsSnap, studentsSnap] = await Promise.all([
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
      .where("createdAt", ">=", rewardStart)
      .where("createdAt", "<", rewardEnd)
      .get(),
    db.collection("students").get(),
  ]);

  // Resolve display names so payroll/paystubs show a name, not the raw uid.
  const nameById = new Map();
  studentsSnap.forEach((doc) => {
    const sd = doc.data();
    const name =
      sd.name ||
      `${sd.firstName || ""} ${sd.lastName || ""}`.trim() ||
      doc.id;
    nameById.set(doc.id, name);
  });

  // Resolve every source's studentId to the canonical doc ID so sessions,
  // warnings and rewards for the same person aggregate together even if they
  // were written under a name vs a doc ID.
  const resolve = buildResolverFromDocs(studentsSnap.docs);

  // Aggregate session hours per student
  const totals = new Map();
  sessionsSnap.forEach((doc) => {
    const s = doc.data();
    const sid = resolve(s.studentId || "");
    if (!sid) return;
    const netMs = typeof s.netMs === "number" ? s.netMs : 0;
    totals.set(sid, (totals.get(sid) || 0) + netMs);
  });

  // Aggregate warning counts per student
  const warningCounts = new Map();
  warningsSnap.forEach((doc) => {
    const w = doc.data();
    const sid = resolve(w.studentId || "");
    if (!sid) return;
    warningCounts.set(sid, (warningCounts.get(sid) || 0) + 1);
  });

  // Aggregate reward deductions per student
  const rewardTotals = new Map();
  const rewardItems = new Map();
  rewardsSnap.forEach((doc) => {
    const r = doc.data();
    const sid = resolve(r.studentId || "");
    if (!sid) return;
    const cost = typeof r.cost === "number" ? r.cost : 0;
    rewardTotals.set(sid, (rewardTotals.get(sid) || 0) + cost);
    const arr = rewardItems.get(sid) || [];
    arr.push({ name: r.rewardName || r.rewardId || "Reward", cost });
    rewardItems.set(sid, arr);
  });

  // Every student touched by the period: worked sessions OR warnings OR rewards.
  // Iterating the union (not just students with sessions) ensures a student who
  // only has deductions still gets a payroll record instead of being dropped.
  const allStudentIds = new Set([
    ...totals.keys(),
    ...warningCounts.keys(),
    ...rewardTotals.keys(),
  ]);

  // Write payroll documents
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
    const netPay = Math.max(0, Math.round((totalPay - deductions) * 100) / 100);
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
  return { count: allStudentIds.size, periodId };
};

module.exports = { generatePayroll };
