import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import type {
  ScenarioCategory,
  ScenarioDoc,
  ScenarioScene,
  ScenarioStatus,
} from "../types/firestore";

export const CATEGORY_TYPE_LABEL: Record<ScenarioCategory, string> = {
  shock: "Shock",
  trauma: "Trauma / Bleeding",
};

/** Default key for the first scene a player sees, matching the built-in scenarios. */
export const DEFAULT_START_SCENE = "initial";

export type ScenarioRecord = {
  id: string;
  title: string;
  description: string;
  category: ScenarioCategory;
  status: ScenarioStatus;
  startSceneKey: string;
  scenes: Record<string, ScenarioScene>;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDate(val: any): Date | null {
  if (val instanceof Timestamp) return val.toDate();
  if (val) return new Date(val as string);
  return null;
}

function toRecord(id: string, data: ScenarioDoc): ScenarioRecord {
  return {
    id,
    title: data.title ?? "(untitled scenario)",
    description: data.description ?? "",
    category: data.category === "trauma" ? "trauma" : "shock",
    status: data.status === "published" ? "published" : "draft",
    startSceneKey: data.startSceneKey || DEFAULT_START_SCENE,
    scenes: data.scenes ?? {},
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/** Number of scenes an authored scenario currently has. */
export function sceneCount(rec: ScenarioRecord): number {
  return Object.keys(rec.scenes).length;
}

/**
 * Fetch every authored scenario, newest first. Docs created by the old seed
 * script (metadata-only, no `scenes`) still load — they just have zero scenes.
 */
export async function fetchScenarios(): Promise<ScenarioRecord[]> {
  const q = query(collection(db, "scenarios"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toRecord(d.id, d.data() as ScenarioDoc));
}

export async function getScenario(id: string): Promise<ScenarioRecord | null> {
  if (!id) return null;
  const snap = await getDoc(doc(db, "scenarios", id));
  if (!snap.exists()) return null;
  return toRecord(snap.id, snap.data() as ScenarioDoc);
}

export type CreateScenarioInput = {
  title: string;
  description?: string;
  category: ScenarioCategory;
};

/**
 * Create a new draft scenario with one empty starting scene so the editor has
 * something to open. Returns the new doc id.
 */
export async function createScenario(
  input: CreateScenarioInput
): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required.");

  const startScene: ScenarioScene = {
    title: "Dispatch",
    text: "",
    vitals: null,
    options: [],
  };

  const payload: ScenarioDoc = {
    title,
    description: input.description?.trim() || "",
    category: input.category,
    type: CATEGORY_TYPE_LABEL[input.category],
    status: "draft",
    startSceneKey: DEFAULT_START_SCENE,
    scenes: { [DEFAULT_START_SCENE]: startScene },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, "scenarios"), payload);
  return ref.id;
}

export type ScenarioUpdate = {
  title?: string;
  description?: string;
  category?: ScenarioCategory;
  status?: ScenarioStatus;
  startSceneKey?: string;
  scenes?: Record<string, ScenarioScene>;
};

/**
 * Persist edits. Strips `undefined` (Firestore rejects it) and always bumps
 * `updatedAt`. When the category changes, the legacy `type` label is kept in
 * sync so the public Scenario Library card renders correctly.
 */
export async function updateScenario(
  id: string,
  updates: ScenarioUpdate
): Promise<void> {
  if (!id) throw new Error("Scenario id is required.");
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (updates.title !== undefined) payload.title = updates.title.trim();
  if (updates.description !== undefined)
    payload.description = updates.description.trim();
  if (updates.category !== undefined) {
    payload.category = updates.category;
    payload.type = CATEGORY_TYPE_LABEL[updates.category];
  }
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.startSceneKey !== undefined)
    payload.startSceneKey = updates.startSceneKey;
  if (updates.scenes !== undefined) payload.scenes = updates.scenes;

  await updateDoc(doc(db, "scenarios", id), payload);
}

export async function setScenarioStatus(
  id: string,
  status: ScenarioStatus
): Promise<void> {
  await updateScenario(id, { status });
}

export async function deleteScenario(id: string): Promise<void> {
  if (!id) throw new Error("Scenario id is required.");
  await deleteDoc(doc(db, "scenarios", id));
}
