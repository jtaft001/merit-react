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

export async function fetchPayPeriods(): Promise<PayPeriod[]> {
  const q = query(collection(db, "pay_periods"), orderBy("endDate", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => {
    const data = doc.data();
    const startDate =
      data.startDate instanceof Timestamp
        ? data.startDate.toDate()
        : data.startDate
        ? new Date(data.startDate)
        : null;
    const endDate =
      data.endDate instanceof Timestamp
        ? data.endDate.toDate()
        : data.endDate
        ? new Date(data.endDate)
        : null;
    const createdAt =
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : data.createdAt
        ? new Date(data.createdAt)
        : null;
    return {
      id: doc.id,
      startDate,
      endDate,
      display: data.display,
      hourlyRate: data.hourlyRate,
      createdAt,
    };
  });
}

export async function fetchPayPeriodById(id: string): Promise<PayPeriod | null> {
  const ref = doc(db, "pay_periods", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const startDate =
    data.startDate instanceof Timestamp
      ? data.startDate.toDate()
      : data.startDate
      ? new Date(data.startDate)
      : null;
  const endDate =
    data.endDate instanceof Timestamp
      ? data.endDate.toDate()
      : data.endDate
      ? new Date(data.endDate)
      : null;
  const createdAt =
    data.createdAt instanceof Timestamp
      ? data.createdAt.toDate()
      : data.createdAt
      ? new Date(data.createdAt)
      : null;
  return {
    id: snap.id,
    startDate,
    endDate,
    display: data.display,
    hourlyRate: data.hourlyRate,
    createdAt,
  };
}
