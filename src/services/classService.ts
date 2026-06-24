import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import type { ClassDoc } from "../types/firestore";

export type ClassRecord = {
  id: string;
  name: string;
  grade?: string;
  dailyStart?: string; // "HH:MM"
  dailyEnd?: string; // "HH:MM"
  termStart?: Date | null;
  termEnd?: Date | null;
  status: "active" | "archived";
  createdAt?: Date | null;
  archivedAt?: Date | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDate(val: any): Date | null {
  if (val instanceof Timestamp) return val.toDate();
  if (val) return new Date(val as string);
  return null;
}

function toRecord(id: string, data: ClassDoc): ClassRecord {
  return {
    id,
    name: data.name ?? "(unnamed class)",
    grade: data.grade,
    dailyStart: data.dailyStart,
    dailyEnd: data.dailyEnd,
    termStart: toDate(data.termStart),
    termEnd: toDate(data.termEnd),
    status: data.status === "archived" ? "archived" : "active",
    createdAt: toDate(data.createdAt),
    archivedAt: toDate(data.archivedAt),
  };
}

/**
 * Fetch all classes, newest first. Filter active/archived in memory so we don't
 * need a composite index.
 */
export async function fetchClasses(): Promise<ClassRecord[]> {
  const q = query(collection(db, "classes"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toRecord(d.id, d.data() as ClassDoc));
}

export type CreateClassInput = {
  name: string;
  grade?: string;
  dailyStart?: string;
  dailyEnd?: string;
  termStart?: Date | null;
  termEnd?: Date | null;
};

export async function createClass(input: CreateClassInput): Promise<string> {
  const name = input.name?.trim();
  if (!name) throw new Error("Class name is required.");

  const payload: Record<string, unknown> = {
    name,
    status: "active",
    createdAt: serverTimestamp(),
  };
  if (input.grade) payload.grade = input.grade.trim();
  if (input.dailyStart) payload.dailyStart = input.dailyStart;
  if (input.dailyEnd) payload.dailyEnd = input.dailyEnd;
  if (input.termStart) payload.termStart = Timestamp.fromDate(input.termStart);
  if (input.termEnd) payload.termEnd = Timestamp.fromDate(input.termEnd);

  const ref = await addDoc(collection(db, "classes"), payload);
  return ref.id;
}

export async function setClassStatus(
  classId: string,
  status: "active" | "archived"
): Promise<void> {
  if (!classId) throw new Error("classId is required.");
  const payload: Record<string, unknown> = { status };
  if (status === "archived") payload.archivedAt = serverTimestamp();
  await updateDoc(doc(db, "classes", classId), payload);
}

export async function updateClass(
  classId: string,
  updates: Partial<CreateClassInput>
): Promise<void> {
  if (!classId) throw new Error("classId is required.");
  const payload: Record<string, unknown> = {};
  if (updates.name != null) payload.name = updates.name.trim();
  if (updates.grade != null) payload.grade = updates.grade.trim();
  if (updates.dailyStart != null) payload.dailyStart = updates.dailyStart;
  if (updates.dailyEnd != null) payload.dailyEnd = updates.dailyEnd;
  if (updates.termStart != null)
    payload.termStart = Timestamp.fromDate(updates.termStart);
  if (updates.termEnd != null)
    payload.termEnd = Timestamp.fromDate(updates.termEnd);
  if (Object.keys(payload).length === 0) return;
  await updateDoc(doc(db, "classes", classId), payload);
}
