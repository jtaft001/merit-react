import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Create a warning for a student. Warnings drive the per-warning payroll
 * deduction (see generatePayroll). `dateStr` (YYYY-MM-DD) determines which
 * pay period the warning falls in, so it must land within the intended period
 * for the deduction to apply when payroll is (re)generated.
 *
 * Writes are admin-only at the Firestore rules layer.
 */
export async function createWarning(params: {
  studentId: string;
  dateStr: string;
  issue: string;
  startTs?: Date | null;
  endTs?: Date | null;
}) {
  const { studentId, dateStr, issue, startTs, endTs } = params;
  if (!studentId || !dateStr || !issue.trim()) {
    throw new Error("studentId, dateStr, and issue are required");
  }
  await addDoc(collection(db, "warnings"), {
    studentId,
    dateStr,
    issue: issue.trim(),
    startTs: startTs ? Timestamp.fromDate(startTs) : null,
    endTs: endTs ? Timestamp.fromDate(endTs) : null,
    createdAt: serverTimestamp(),
  });
}

export async function deleteWarning(id: string) {
  if (!id) return;
  await deleteDoc(doc(db, "warnings", id));
}
