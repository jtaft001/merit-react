import {
  collection,
  getDocs,
  query,
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
	email?: string;
	status?: string;
	className?: string;
	authUid?: string;
	[key: string]: unknown;
};

/**
 * Fetch all students ordered by name.
 */
export async function fetchStudents(): Promise<StudentRecord[]> {
	const colRef = collection(db, "students");
	const q = query(colRef, orderBy("name"));
	const snapshot = await getDocs(q);

	return snapshot.docs.map((doc) => ({
		id: doc.id,
		...(doc.data() as StudentDoc),
	})) as StudentRecord[];
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

	const doc = snapshot.docs[0];
	return {
		id: doc.id,
		...(doc.data() as StudentDoc),
	} as StudentRecord;
}
