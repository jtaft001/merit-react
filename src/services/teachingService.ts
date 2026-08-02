import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { TEACHING_COLLECTION, getCollection } from "../teaching/schema";

/**
 * A Teaching HQ record. `type` names which database it belongs to; the rest of
 * the keys are the schema fields for that type. Dates are stored as Firestore
 * Timestamps and surfaced here as ISO "YYYY-MM-DD" strings for the editors.
 */
export type TeachingRecord = {
  id: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDate(val: any): Date | null {
  if (val instanceof Timestamp) return val.toDate();
  if (val) return new Date(val as string);
  return null;
}

/** Convert a stored value into what the editor/list expects. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromStored(val: any): any {
  if (val instanceof Timestamp) {
    // Represent dates as local YYYY-MM-DD so <input type="date"> round-trips.
    const d = val.toDate();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return val;
}

function toRecord(id: string, data: Record<string, unknown>): TeachingRecord {
  const rec: TeachingRecord = { id, type: String(data.type ?? "") };
  for (const [k, v] of Object.entries(data)) {
    if (k === "createdAt" || k === "updatedAt") continue;
    rec[k] = fromStored(v);
  }
  rec.createdAt = toDate(data.createdAt);
  rec.updatedAt = toDate(data.updatedAt);
  return rec;
}

/** Fetch every record of one database type, newest-created first. */
export async function listRecords(type: string): Promise<TeachingRecord[]> {
  const q = query(collection(db, TEACHING_COLLECTION), where("type", "==", type));
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => toRecord(d.id, d.data() as Record<string, unknown>));
  rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  return rows;
}

export async function getRecord(id: string): Promise<TeachingRecord | null> {
  if (!id) return null;
  const snap = await getDoc(doc(db, TEACHING_COLLECTION, id));
  if (!snap.exists()) return null;
  return toRecord(snap.id, snap.data() as Record<string, unknown>);
}

/**
 * Build a Firestore-safe payload from raw editor values: converts date strings
 * to Timestamps, coerces numbers, and drops empty values (Firestore rejects
 * `undefined`, and we don't want to store empty strings).
 */
function buildPayload(type: string, values: Record<string, unknown>): Record<string, unknown> {
  const def = getCollection(type);
  const payload: Record<string, unknown> = {};
  const fields = def?.fields ?? [];

  for (const field of fields) {
    const raw = values[field.key];
    if (raw === undefined || raw === null || raw === "") continue;

    switch (field.type) {
      case "number":
      case "money": {
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isNaN(n)) payload[field.key] = n;
        break;
      }
      case "date": {
        // Stored value is "YYYY-MM-DD"; parse as a local date.
        const d = raw instanceof Date ? raw : new Date(`${raw}T00:00`);
        if (!Number.isNaN(d.getTime())) payload[field.key] = Timestamp.fromDate(d);
        break;
      }
      case "checkbox": {
        payload[field.key] = raw === true || raw === "true";
        break;
      }
      case "multiselect":
      case "relation": {
        if (Array.isArray(raw) && raw.length > 0) payload[field.key] = raw;
        break;
      }
      default:
        payload[field.key] = raw;
    }
  }
  return payload;
}

export async function createRecord(
  type: string,
  values: Record<string, unknown>
): Promise<string> {
  if (!getCollection(type)) throw new Error(`Unknown database "${type}".`);
  const payload = buildPayload(type, values);
  payload.type = type;
  payload.createdAt = serverTimestamp();
  payload.updatedAt = serverTimestamp();
  const ref = await addDoc(collection(db, TEACHING_COLLECTION), payload);
  return ref.id;
}

export async function updateRecord(
  id: string,
  type: string,
  values: Record<string, unknown>
): Promise<void> {
  if (!id) throw new Error("Record id is required.");
  const payload = buildPayload(type, values);
  payload.updatedAt = serverTimestamp();
  // Explicitly clear fields the user emptied (buildPayload skips empties).
  const def = getCollection(type);
  for (const field of def?.fields ?? []) {
    if (!(field.key in payload)) {
      const raw = values[field.key];
      if (raw === "" || raw === null || (Array.isArray(raw) && raw.length === 0)) {
        payload[field.key] = null;
      }
    }
  }
  await updateDoc(doc(db, TEACHING_COLLECTION, id), payload);
}

export async function deleteRecord(id: string): Promise<void> {
  if (!id) throw new Error("Record id is required.");
  await deleteDoc(doc(db, TEACHING_COLLECTION, id));
}

/**
 * Load lightweight {id, title} entries for a related database, for relation
 * pickers and for resolving relation ids to titles in list/detail views.
 */
export async function listRelationOptions(
  type: string
): Promise<{ id: string; title: string }[]> {
  const def = getCollection(type);
  const titleField = def?.titleField ?? "id";
  const rows = await listRecords(type);
  return rows.map((r) => ({
    id: r.id,
    title: (r[titleField] as string) || "(untitled)",
  }));
}
