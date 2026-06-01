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
  studentName?: string;
  periodId?: string;
  periodEnd?: Date | null;
  netHours?: number;
  totalPay?: number;
  netPay?: number;
  deductions?: number;
  rewardDeduction?: number;
  warningDeduction?: number;
  rewardItems?: { name?: string; cost?: number }[];
  createdAt?: Date | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDate(val: any): Date | null {
  if (val instanceof Timestamp) return val.toDate();
  if (val) return new Date(val as string);
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPayrollRecord(id: string, data: Record<string, any>): PayrollRecord {
  return {
    id,
    studentId: data.studentId,
    studentName: data.studentName,
    periodId: data.periodId,
    periodEnd: toDate(data.periodEnd),
    netHours: data.netHours,
    totalPay: data.totalPay ?? data.netPay,
    netPay: data.netPay,
    deductions: data.deductions,
    rewardDeduction: data.rewardDeduction,
    warningDeduction: data.warningDeduction,
    createdAt: toDate(data.createdAt),
  };
}

export async function fetchPayrollReports(max = 50): Promise<PayrollRecord[]> {
  const q = query(
    collection(db, "payroll"),
    orderBy("periodEnd", "desc"),
    limitClause(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => toPayrollRecord(doc.id, doc.data()));
}

export async function fetchPayrollForPeriod(periodId: string, max = 200): Promise<PayrollRecord[]> {
  const q = query(
    collection(db, "payroll"),
    where("periodId", "==", periodId),
    orderBy("createdAt", "desc"),
    limitClause(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => toPayrollRecord(doc.id, doc.data()));
}

export async function fetchPayrollForStudent(studentId: string, max = 50): Promise<PayrollRecord[]> {
  const q = query(
    collection(db, "payroll"),
    where("studentId", "==", studentId),
    orderBy("periodEnd", "desc"),
    limitClause(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => toPayrollRecord(doc.id, doc.data()));
}

export async function fetchPayrollById(id: string): Promise<PayrollRecord | null> {
  const ref = doc(db, "payroll", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return toPayrollRecord(snap.id, snap.data());
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
      clockIn: toDate(data.clockIn),
      clockOut: toDate(data.clockOut),
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
      startTs: toDate(data.startTs),
      endTs: toDate(data.endTs),
    };
  });
}