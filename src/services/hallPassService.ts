import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import type { HallPassSettings, PassDoc } from "../types/firestore";

export const DEFAULT_HALL_PASS_SETTINGS: HallPassSettings = {
  passesPerSemester: 5,
  pointsPerUnusedPass: 50,
  oneOutAtATime: false,
  currentSemester: "unset",
  exemptDestinations: ["nurse", "office", "counselor"],
};

// ---- Kiosk (unauthenticated) — everything goes through Cloud Functions ----

export type LookupResult = {
  studentDocId: string;
  studentName: string;
  photoUrl: string | null;
  period: string;
  passesRemaining: number;
  passesPerSemester: number;
  pointsPerUnusedPass: number;
  exemptDestinations: string[];
  currentlyOut: boolean;
};

const call = <TReq, TRes>(name: string) => {
  const fn = httpsCallable<TReq, TRes>(functions, name);
  return async (data: TReq): Promise<TRes> => (await fn(data)).data;
};

export const hallPassLookup = call<{ studentIdNumber: string }, LookupResult>("hallPassLookup");
export const hallPassCheckout = call<
  { studentDocId: string; destination: string },
  { studentName: string; destination: string; exempt: boolean; passesRemaining: number }
>("hallPassCheckout");
export const hallPassReturn = call<{ studentDocId: string }, { studentName: string; durationSeconds: number }>("hallPassReturn");
export const hallPassOverride = call<{ studentDocId: string; destination?: string }, { studentName: string }>("hallPassOverride");
export const hallPassMarkExempt = call<{ passId: string }, { ok: boolean }>("hallPassMarkExempt");

// ---- Teacher (authenticated) — direct Firestore reads gated by rules ----

export type PassRecord = PassDoc & { id: string; outAt: Date | null; backAt: Date | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDate(v: any): Date | null {
  if (v instanceof Timestamp) return v.toDate();
  return v ? new Date(v) : null;
}
function toRecord(id: string, d: PassDoc): PassRecord {
  return { id, ...d, outAt: toDate(d.outAt), backAt: toDate(d.backAt) };
}

/** Live subscription to currently-out passes (backAt == null), newest first. */
export function subscribeOpenPasses(cb: (passes: PassRecord[]) => void): () => void {
  const q = query(collection(db, "passes"), where("backAt", "==", null), orderBy("outAt", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => toRecord(d.id, d.data() as PassDoc))),
    (err) => {
      console.error("open passes subscription:", err);
      cb([]);
    }
  );
}

// The roster's "last used" comes from the denormalized `lastPassAt` on the
// student doc (set by the checkout function), so no per-student pass query is needed.

// ---- Settings ----

export async function getHallPassSettings(): Promise<HallPassSettings> {
  const snap = await getDoc(doc(db, "settings", "hallPass"));
  return { ...DEFAULT_HALL_PASS_SETTINGS, ...(snap.exists() ? (snap.data() as HallPassSettings) : {}) };
}

export async function saveHallPassSettings(settings: Partial<HallPassSettings>): Promise<void> {
  await setDoc(doc(db, "settings", "hallPass"), { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}
