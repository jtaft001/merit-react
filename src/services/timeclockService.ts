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

export type TimeclockEvent = {
  id: string;
  studentId: string;
  timestamp: Date;
  action: string;
  source?: string;
};

/**
  * Fetch recent timeclock events, newest first.
  * @param daysBack window in days to look back from now
  * @param max maximum number of events to return
  */
export async function fetchRecentEvents(
  daysBack = 7,
  max = 200
): Promise<TimeclockEvent[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const q = query(
    collection(db, "timeclock"),
    where("timestamp", ">=", since),
    orderBy("timestamp", "desc"),
    limitClause(max)
  );

  const snap = await getDocs(q);
  return snap.docs.map((doc) => {
    const data = doc.data();
    const ts = data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp);
    return {
      id: doc.id,
      studentId: data.studentId ?? "",
      timestamp: ts,
      action: data.action ?? "",
      source: data.source,
    };
  });
}
