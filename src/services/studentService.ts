import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../firebase";
import type { StudentDoc } from "../types/firestore";

export type StudentRecord = {
	id: string;
	name?: string;
	firstName?: string;
	lastName?: string;
	email?: string;
	status?: string;
	grade?: string;
	studentNumber?: string;
	classId?: string;
	className?: string;
	authUid?: string;
	[key: string]: unknown;
};

/** A student counts as "dropped" if their status is Dropped (case-insensitive). */
export function isDropped(status?: string): boolean {
	return (status || "").toLowerCase() === "dropped";
}

/**
 * Fetch students ordered by name. Dropped (archived) students are EXCLUDED by
 * default so they disappear from every active view (timeclock dashboard,
 * rewards, etc.). Pass includeDropped=true for admin roster management where you
 * need to see and restore dropped students.
 */
export async function fetchStudents(
	includeDropped = false
): Promise<StudentRecord[]> {
	const colRef = collection(db, "students");
	const q = query(colRef, orderBy("name"));
	const snapshot = await getDocs(q);

	const all = snapshot.docs.map((doc) => ({
		id: doc.id,
		...(doc.data() as StudentDoc),
	})) as StudentRecord[];

	return includeDropped ? all : all.filter((s) => !isDropped(s.status));
}

/**
 * Fetch attempts for a specific student, newest first.
 */
export async function fetchStudentAttempts(studentId: string) {
	const colRef = collection(db, "attempts");
	const q = query(
		colRef,
		where("studentId", "==", studentId),
		orderBy("attemptedAt", "desc"),
		limit(50)
	);

	const snapshot = await getDocs(q);

	return snapshot.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	}));
}

/**
 * Find the student document whose authUid matches the given Firebase user.
 * Returns null if no linked student document exists.
 */
export async function getStudentForUser(user: User | null): Promise<StudentRecord | null> {
	if (!user || !user.uid) return null;

	const colRef = collection(db, "students");
	const q = query(colRef, where("authUid", "==", user.uid), limit(1));
	const snapshot = await getDocs(q);

	if (snapshot.empty) return null;

	const docSnap = snapshot.docs[0];
	return {
		id: docSnap.id,
		...(docSnap.data() as StudentDoc),
	} as StudentRecord;
}

/**
 * Archive ("drop") or restore a student. This is a soft status change — it never
 * deletes the underlying record, so timeclock, payroll, and scenario history are
 * preserved (FERPA-safe and reversible).
 */
export async function setStudentStatus(
	studentId: string,
	status: "Active" | "Dropped"
): Promise<void> {
	if (!studentId) throw new Error("studentId is required.");
	const payload: Record<string, unknown> = { status };
	if (status === "Dropped") payload.droppedAt = serverTimestamp();
	await updateDoc(doc(db, "students", studentId), payload);
}

/**
 * Assign a student to a class (or clear it by passing null). We denormalize the
 * className onto the student doc so existing list/search views keep working.
 */
export async function assignStudentToClass(
	studentId: string,
	classId: string | null,
	className: string | null
): Promise<void> {
	if (!studentId) throw new Error("studentId is required.");
	await updateDoc(doc(db, "students", studentId), {
		classId: classId ?? "",
		className: className ?? "",
	});
}
