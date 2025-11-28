import { collection, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export type AttemptPayload = {
  studentId: string;
  studentName?: string;
  scenarioId?: string;
  scenarioTitle?: string;
  score?: number;
  passed?: boolean;
  status?: string;
  currentSceneKey?: string;
  decisions?: Array<{
    sceneKey: string;
    choiceText: string;
    points: number;
  }>;
};

export async function saveAttempt({
  studentId,
  studentName,
  scenarioId,
  scenarioTitle,
  score,
  passed,
  status = "Complete",
  currentSceneKey,
  decisions,
}: AttemptPayload) {
  if (!studentId) {
    throw new Error("studentId is required");
  }

  const payload: Record<string, unknown> = {
    studentId,
    attemptedAt: serverTimestamp(),
    status,
  };

  if (studentName != null) payload.studentName = studentName;
  if (scenarioId != null) payload.scenarioId = scenarioId;
  if (scenarioTitle != null) payload.scenarioTitle = scenarioTitle;
  if (score != null) payload.score = score;
  if (passed != null) payload.passed = passed;
  if (currentSceneKey != null) payload.currentSceneKey = currentSceneKey;
  if (decisions != null) payload.decisions = decisions;

  await addDoc(collection(db, "attempts"), payload);
}

export async function createAttempt({
  studentId,
  studentName,
  scenarioId,
  scenarioTitle,
  score,
  passed,
  status = "In Progress",
  currentSceneKey,
  decisions,
}: AttemptPayload) {
  if (!studentId) {
    throw new Error("studentId is required");
  }

  const payload: Record<string, unknown> = {
    studentId,
    attemptedAt: serverTimestamp(),
    status,
  };

  if (studentName != null) payload.studentName = studentName;
  if (scenarioId != null) payload.scenarioId = scenarioId;
  if (scenarioTitle != null) payload.scenarioTitle = scenarioTitle;
  if (score != null) payload.score = score;
  if (passed != null) payload.passed = passed;
  if (currentSceneKey != null) payload.currentSceneKey = currentSceneKey;
  if (decisions != null) payload.decisions = decisions;

  const docRef = await addDoc(collection(db, "attempts"), payload);
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
