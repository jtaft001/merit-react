import { collection, doc, getDoc, getDocs, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "../firebase";

export type PayPeriod = {
  id: string;
  startDate?: Date | null;
  endDate?: Date | null;
  display?: string;
  hourlyRate?: number;
  createdAt?: Date | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDate(val: any): Date | null {
  if (val instanceof Timestamp) return val.toDate();
  if (val) return new Date(val as string);
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPeriod(id: string, data: Record<string, any>): PayPeriod {
  return {
    id,
    startDate: toDate(data.startDate),
    endDate: toDate(data.endDate),
    display: data.display,
    hourlyRate: data.hourlyRate,
    createdAt: toDate(data.createdAt),
  };
}

export async function fetchPayPeriods(): Promise<PayPeriod[]> {
  const q = query(collection(db, "pay_periods"), orderBy("endDate", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => toPeriod(doc.id, doc.data()));
}

export async function fetchPayPeriodById(id: string): Promise<PayPeriod | null> {
  const ref = doc(db, "pay_periods", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return toPeriod(snap.id, snap.data());
}