import { collection, getDocs, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { addDoc, serverTimestamp, limit as limitClause } from "firebase/firestore";

export type RewardPurchase = {
  id: string;
  studentId: string;
  rewardId?: string;
  rewardName?: string;
  cost?: number;
  status?: string;
  createdAt?: Date | null;
};

export type RewardCatalogItem = {
  id: string;
  name: string;
  cost: number;
  tier: "low" | "mid" | "high" | "full-bank";
  category: "academic" | "prestige" | "other";
  notes?: string;
};

export const rewardCatalog: RewardCatalogItem[] = [
  { id: "snack-10", name: "$10 Snack", cost: 10, tier: "low", category: "other" },
  { id: "music-15", name: "$15 Music during skills", cost: 15, tier: "low", category: "other" },
  { id: "seat-20", name: "$20 Seat choice for one week", cost: 20, tier: "low", category: "other" },
  { id: "scenario-role-25", name: "$25 Scenario role choice", cost: 25, tier: "low", category: "other" },
  { id: "partner-50", name: "$50 Partner choice for skills", cost: 50, tier: "mid", category: "other" },
  { id: "warmup-75", name: "$75 Choose warm-up", cost: 75, tier: "mid", category: "other" },
  { id: "patch-100", name: "$100 EMS patch or sticker pack", cost: 100, tier: "mid", category: "other" },
  { id: "captain-200", name: "$200 Skills Captain for a week", cost: 200, tier: "high", category: "other" },
  { id: "designer-300", name: "$300 Scenario Designer", cost: 300, tier: "high", category: "other" },
  { id: "prep-400", name: "$400 Extra guided practical prep time", cost: 400, tier: "high", category: "other" },
  { id: "exam-replacement-1050", name: "Unit Exam Replacement", cost: 1050, tier: "full-bank", category: "academic", notes: "Replace lowest unit exam with average of the others. Requires perfect attendance and zero prior reward spending in this period." },
  { id: "final-override-1100", name: "Final Exam Override", cost: 1100, tier: "full-bank", category: "academic", notes: "Final exam cannot lower the semester grade." },
  { id: "skills-forgive-1150", name: "Skills Practical Forgiveness", cost: 1150, tier: "full-bank", category: "academic", notes: "Failing station converts to pass if safety steps completed." },
  { id: "assignment-amnesty-1000", name: "Assignment Amnesty", cost: 1000, tier: "full-bank", category: "academic", notes: "All missing assignments become 70%. Late penalties removed." },
  { id: "semester-bump-1200", name: "Semester Grade Bump", cost: 1200, tier: "full-bank", category: "academic", notes: "+3 percentage points to final grade. Cap at 93%." },
  { id: "lor-1000", name: "Instructor Letter of Recommendation", cost: 1000, tier: "full-bank", category: "prestige" },
  { id: "lead-for-day-1050", name: "Lead Instructor for a Day", cost: 1050, tier: "full-bank", category: "prestige", notes: "Setup, run warm-ups, assign roles, support evaluations." },
  { id: "coin-900", name: "Custom Challenge Coin or Plaque", cost: 900, tier: "full-bank", category: "prestige" },
  { id: "captain-final-1100", name: "Skills Captain Final Week", cost: 1100, tier: "full-bank", category: "prestige" },
];

export async function fetchRewardPurchasesForStudent(
  studentId: string,
  start?: Date | null,
  end?: Date | null
): Promise<RewardPurchase[]> {
  if (!studentId) return [];
  let qRef = query(
    collection(db, "reward_purchases"),
    where("studentId", "==", studentId),
    where("status", "==", "approved"),
    orderBy("createdAt", "desc"),
    limitClause(200)
  );
  if (start && end) {
    qRef = query(
      collection(db, "reward_purchases"),
      where("studentId", "==", studentId),
      where("status", "==", "approved"),
      where("createdAt", ">=", start),
      where("createdAt", "<=", end),
      orderBy("createdAt", "desc"),
      limitClause(200)
    );
  }

  const snap = await getDocs(qRef);
  return snap.docs.map((doc) => {
    const data = doc.data();
    const createdAt =
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : data.createdAt
        ? new Date(data.createdAt)
        : null;
    return {
      id: doc.id,
      studentId: data.studentId ?? "",
      rewardId: data.rewardId,
      rewardName: data.rewardName,
      cost: data.cost,
      status: data.status,
      createdAt,
    };
  });
}

export async function createRewardPurchase(params: {
  studentId: string;
  rewardId: string;
  rewardName: string;
  cost: number;
  status?: "approved" | "pending";
}) {
  const { studentId, rewardId, rewardName, cost, status = "approved" } = params;
  if (!studentId || !rewardId || !rewardName || Number.isNaN(cost)) {
    throw new Error("Missing required fields for reward purchase");
  }
  await addDoc(collection(db, "reward_purchases"), {
    studentId,
    rewardId,
    rewardName,
    cost,
    status,
    createdAt: serverTimestamp(),
  });
}

export async function fetchRewardSpendAndBalance(studentId: string, startDate?: Date | null): Promise<{
  totalRewardSpend: number;
  totalGross: number;
  balance: number;
}> {
  if (!studentId) return { totalRewardSpend: 0, totalGross: 0, balance: 0 };
  // Sum reward spend
  const spendSnap = await getDocs(
    query(
      collection(db, "reward_purchases"),
      where("studentId", "==", studentId),
      where("status", "==", "approved")
    )
  );
  let totalRewardSpend = 0;
  spendSnap.forEach((d) => {
    const cost = d.data().cost;
    if (typeof cost === "number") totalRewardSpend += cost;
  });

  // Sum gross pay from payroll
  const payrollSnap = await getDocs(
    query(collection(db, "payroll"), where("studentId", "==", studentId), limitClause(1000))
  );
  let totalGross = 0;
  payrollSnap.forEach((d) => {
    const data = d.data();
    const periodEnd =
      data.periodEnd instanceof Timestamp
        ? data.periodEnd.toDate()
        : data.periodEnd
        ? new Date(data.periodEnd)
        : null;
    if (startDate && periodEnd && periodEnd < startDate) return;
    const tp = data.totalPay;
    if (typeof tp === "number") totalGross += tp;
  });

  const balance = Math.max(0, totalGross - totalRewardSpend);
  return { totalRewardSpend, totalGross, balance };
}
