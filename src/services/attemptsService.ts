import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  where,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import type { AttemptDoc } from "../types/firestore";

export type AttemptPayload = AttemptDoc & {
  studentId: string;
};

function buildPayload(
  data: AttemptPayload,
  defaultStatus: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    studentId: data.studentId,
    attemptedAt: serverTimestamp(),
    status: data.status ?? defaultStatus,
  };
  if (data.studentName != null) payload.studentName = data.studentName;
  if (data.scenarioId != null) payload.scenarioId = data.scenarioId;
  if (data.scenarioTitle != null) payload.scenarioTitle = data.scenarioTitle;
  if (data.score != null) payload.score = data.score;
  if (data.passed != null) payload.passed = data.passed;
  if (data.currentSceneKey != null) payload.currentSceneKey = data.currentSceneKey;
  if (data.decisions != null) payload.decisions = data.decisions;
  return payload;
}

export async function saveAttempt(data: AttemptPayload): Promise<void> {
  if (!data.studentId) throw new Error("studentId is required");
  await addDoc(collection(db, "attempts"), buildPayload(data, "Complete"));
}

export async function createAttempt(data: AttemptPayload): Promise<string> {
  if (!data.studentId) throw new Error("studentId is required");
  const docRef = await addDoc(
    collection(db, "attempts"),
    buildPayload(data, "In Progress")
  );
  return docRef.id;
}

export async function updateAttempt(
  attemptId: string | null,
  data: Partial<AttemptPayload & { attemptedAt?: "serverTimestamp" }>
) {
  if (!attemptId) return;

  const payload: Record<string, unknown> = {};

  if (data.studentName != null) payload.studentName = data.studentName;
  if (data.scenarioTitle != null) payload.scenarioTitle = data.scenarioTitle;
  if (data.score != null) payload.score = data.score;
  if (data.passed != null) payload.passed = data.passed;
  if (data.status != null) payload.status = data.status;
  if (data.studentId != null) payload.studentId = data.studentId;
  if (data.scenarioId != null) payload.scenarioId = data.scenarioId;
  if (data.currentSceneKey != null) payload.currentSceneKey = data.currentSceneKey;
  if (data.decisions != null) payload.decisions = data.decisions;
  if (data.attemptedAt === "serverTimestamp") {
    payload.attemptedAt = serverTimestamp();
  }

  if (Object.keys(payload).length === 0) return;

  await updateDoc(doc(db, "attempts", attemptId), payload);
}

export type AttemptRecord = AttemptPayload & {
  id: string;
  attemptedAt?: unknown;
};

/**
 * Fetch the most recent attempt for a student + scenario, optionally filtered by status.
 */
export async function fetchLatestAttemptForScenario(
  studentId: string,
  scenarioId: string,
  status?: string
): Promise<AttemptRecord | null> {
  const constraints = [
    where("studentId", "==", studentId),
    where("scenarioId", "==", scenarioId),
  ];
  if (status) {
    constraints.push(where("status", "==", status));
  }
  const q = query(
    collection(db, "attempts"),
    ...constraints,
    orderBy("attemptedAt", "desc"),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return {
    id: docSnap.id,
    ...(docSnap.data() as AttemptPayload),
  };
}

/**
 * Fetch the most recent in-progress attempt for a student across all scenarios.
 */
export async function fetchLatestInProgressForStudent(
  studentId: string
): Promise<AttemptRecord | null> {
  const q = query(
    collection(db, "attempts"),
    where("studentId", "==", studentId),
    where("status", "==", "In Progress"),
    orderBy("attemptedAt", "desc"),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return {
    id: docSnap.id,
    ...(docSnap.data() as AttemptPayload),
  };
}
