import {
  collection,
  getDocs,
  limit as limitClause,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

export type SessionRecord = {
  id: string;
  studentId: string;
  dateStr: string;
  clockIn?: Date | null;
  clockOut?: Date | null;
  grossMs?: number;
  breakMs?: number;
  netMs?: number;
  breakCount?: number;
};

export type WarningRecord = {
  id: string;
  studentId: string;
  dateStr: string;
  issue: string;
  startTs?: Date | null;
  endTs?: Date | null;
};

/**
 * Fetch sessions for a student over the last N days, newest first.
 */
export async function fetchSessionsForStudent(
  studentId: string,
  daysBack = 30,
  max = 200
): Promise<SessionRecord[]> {
  if (!studentId) return [];

  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const q = query(
    collection(db, "sessions"),
    where("studentId", "==", studentId),
    where("clockIn", ">=", since),
    orderBy("clockIn", "desc"),
    limitClause(max)
  );

  const snap = await getDocs(q);
  return snap.docs.map((doc) => {
    const data = doc.data();
    const clockIn = data.clockIn instanceof Timestamp ? data.clockIn.toDate() : data.clockIn;
    const clockOut = data.clockOut instanceof Timestamp ? data.clockOut.toDate() : data.clockOut;
    return {
      id: doc.id,
      studentId: data.studentId ?? "",
      dateStr: data.dateStr ?? "",
      clockIn: clockIn ?? null,
      clockOut: clockOut ?? null,
      grossMs: data.grossMs,
      breakMs: data.breakMs,
      netMs: data.netMs,
      breakCount: data.breakCount,
    };
  });
}

/**
 * Fetch warnings for a student over the last N days, newest first.
 */
export async function fetchWarningsForStudent(
  studentId: string,
  daysBack = 30,
  max = 200
): Promise<WarningRecord[]> {
  if (!studentId) return [];

  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const q = query(
    collection(db, "warnings"),
    where("studentId", "==", studentId),
    where("startTs", ">=", since),
    orderBy("startTs", "desc"),
    limitClause(max)
  );

  const snap = await getDocs(q);
  return snap.docs.map((doc) => {
    const data = doc.data();
    const startTs = data.startTs instanceof Timestamp ? data.startTs.toDate() : data.startTs;
    const endTs = data.endTs instanceof Timestamp ? data.endTs.toDate() : data.endTs;
    return {
      id: doc.id,
      studentId: data.studentId ?? "",
      dateStr: data.dateStr ?? "",
      issue: data.issue ?? "",
      startTs: startTs ?? null,
      endTs: endTs ?? null,
    };
  });
}
