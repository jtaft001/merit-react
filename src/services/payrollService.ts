import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitClause,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

export type Session = {
  id: string;
  studentId?: string;
  dateStr?: string;
  clockIn?: Date | null;
  clockOut?: Date | null;
  netMs?: number;
  grossMs?: number;
  breakMs?: number;
  breakCount?: number;
};

export type Warning = {
  id: string;
  studentId?: string;
  dateStr?: string;
  issue?: string;
  startTs?: Date | null;
  endTs?: Date | null;
};

export type PayrollRecord = {
  id: string;
  studentId?: string;
  periodId?: string;
  periodEnd?: Date | null;
  netHours?: number;
  paidHours?: number;
  totalPay?: number;
  netPay?: number;
  deductions?: number;
  rewardDeduction?: number;
  warningDeduction?: number;
  rewardItems?: { name?: string; cost?: number }[];
  createdAt?: Date | null;
};

export async function fetchPayrollReports(max = 50): Promise<PayrollRecord[]> {
  const q = query(
    collection(db, "payroll"),
    orderBy("periodEnd", "desc"),
    limitClause(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => {
    const data = doc.data();
    const periodEnd =
      data.periodEnd instanceof Timestamp
        ? data.periodEnd.toDate()
        : data.periodEnd
        ? new Date(data.periodEnd)
        : null;
    const createdAt =
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : data.createdAt
        ? new Date(data.createdAt)
        : null;
    return {
      id: doc.id,
      studentId: data.studentId,
      periodId: data.periodId,
      periodEnd,
      netHours: data.netHours,
      paidHours: data.paidHours,
      totalPay: data.totalPay ?? data.netPay,
      netPay: data.netPay,
      deductions: data.deductions,
      createdAt,
    };
  });
}

export async function fetchPayrollForPeriod(periodId: string, max = 200): Promise<PayrollRecord[]> {
  const q = query(
    collection(db, "payroll"),
    where("periodId", "==", periodId),
    orderBy("createdAt", "desc"),
    limitClause(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => {
    const data = doc.data();
    const periodEnd =
      data.periodEnd instanceof Timestamp
        ? data.periodEnd.toDate()
        : data.periodEnd
        ? new Date(data.periodEnd)
        : null;
    const createdAt =
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : data.createdAt
        ? new Date(data.createdAt)
        : null;
    return {
      id: doc.id,
      studentId: data.studentId,
      periodId: data.periodId,
      periodEnd,
      netHours: data.netHours,
      paidHours: data.paidHours,
      totalPay: data.totalPay ?? data.netPay,
      netPay: data.netPay,
      deductions: data.deductions,
      createdAt,
    };
  });
}

export async function fetchPayrollById(id: string): Promise<PayrollRecord | null> {
  const ref = doc(db, "payroll", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const periodEnd =
    data.periodEnd instanceof Timestamp
      ? data.periodEnd.toDate()
      : data.periodEnd
      ? new Date(data.periodEnd)
      : null;
  const createdAt =
    data.createdAt instanceof Timestamp
      ? data.createdAt.toDate()
      : data.createdAt
      ? new Date(data.createdAt)
      : null;
  return {
    id: snap.id,
    studentId: data.studentId,
    periodId: data.periodId,
    periodEnd,
    netHours: data.netHours,
    paidHours: data.paidHours,
    totalPay: data.totalPay ?? data.netPay,
    netPay: data.netPay,
    deductions: data.deductions,
    createdAt,
  };
}

export async function fetchSessionsForStudentPeriod(
  studentId: string,
  startStr: string,
  endStr: string
): Promise<Session[]> {
  const q = query(
    collection(db, "sessions"),
    where("studentId", "==", studentId),
    where("dateStr", ">=", startStr),
    where("dateStr", "<=", endStr),
    orderBy("dateStr", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      studentId: data.studentId,
      dateStr: data.dateStr,
      clockIn: data.clockIn instanceof Timestamp ? data.clockIn.toDate() : data.clockIn ?? null,
      clockOut: data.clockOut instanceof Timestamp ? data.clockOut.toDate() : data.clockOut ?? null,
      netMs: data.netMs,
      grossMs: data.grossMs,
      breakMs: data.breakMs,
      breakCount: data.breakCount,
    };
  });
}

export async function fetchWarningsForStudentPeriod(
  studentId: string,
  startStr: string,
  endStr: string
): Promise<Warning[]> {
  const q = query(
    collection(db, "warnings"),
    where("studentId", "==", studentId),
    where("dateStr", ">=", startStr),
    where("dateStr", "<=", endStr),
    orderBy("dateStr", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      studentId: data.studentId,
      dateStr: data.dateStr,
      issue: data.issue,
      startTs: data.startTs instanceof Timestamp ? data.startTs.toDate() : data.startTs ?? null,
      endTs: data.endTs instanceof Timestamp ? data.endTs.toDate() : data.endTs ?? null,
    };
  });
}
