#!/usr/bin/env node
/**
 * Repair dangling lesson-day back-references in the teaching data.
 *
 * When lesson days are rebuilt (rebuild-lpscs-lessons / rebuild-ipc-lessons),
 * the old day docs are deleted and recreated with new ids. Any `deadlines.lessonDay`
 * or `materials.forLesson` relation that pointed at an old day is left dangling.
 *
 * This re-points each dangling relation to the CURRENT lesson day on the same
 * course whose date matches the deadline's `dueDate` (or the material's `neededBy`).
 * If no class day matches that date, the dead reference is cleared (set to []),
 * so nothing is left pointing at a deleted doc.
 *
 * Only dangling references are touched; valid ones are left alone. Dry run by default.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/repair-teaching-links.js            # preview
 *   node scripts/repair-teaching-links.js --write     # apply
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

const COLLECTION = "teaching";
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const WRITE = process.argv.includes("--write");

function initAdmin() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (credPath) {
    const resolved = path.resolve(credPath);
    if (!fs.existsSync(resolved)) { console.error("Credential file not found:", resolved); process.exit(1); }
    initializeApp({ credential: cert(resolved), projectId: PROJECT_ID });
  } else {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
}

/** Firestore Timestamp | string | Date → "YYYY-MM-DD" (local), or "" if none. */
function ymd(v) {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v.length <= 10 ? `${v}T00:00` : v) : v.toDate ? v.toDate() : v;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function run() {
  initAdmin();
  const db = getFirestore();
  const snap = await db.collection(COLLECTION).get();
  const docs = [];
  snap.forEach((d) => docs.push({ id: d.id, ref: d.ref, data: d.data() }));
  const idset = new Set(docs.map((d) => d.id));

  // Index current lesson days by "courseId|date" for re-matching.
  const dayByCourseDate = new Map();
  for (const d of docs) {
    if (d.data.type !== "lessonDays") continue;
    const date = ymd(d.data.date);
    for (const cid of d.data.course || []) if (date) dayByCourseDate.set(`${cid}|${date}`, d.id);
  }

  // [collection type, relation field, date field]
  const SPECS = [
    ["deadlines", "lessonDay", "dueDate"],
    ["materials", "forLesson", "neededBy"],
  ];

  const updates = []; // { ref, field, value, label, action }
  for (const [type, relField, dateField] of SPECS) {
    for (const d of docs) {
      if (d.data.type !== type) continue;
      const rel = d.data[relField];
      if (!Array.isArray(rel) || !rel.length) continue;
      const dangling = rel.filter((id) => !idset.has(id));
      if (!dangling.length) continue; // all valid

      const title = d.data.assessment || d.data.item || "(untitled)";
      const date = ymd(d.data[dateField]);
      const courses = d.data.course || [];
      // Try to find a current lesson day on the same course + date.
      let match = null;
      for (const cid of courses) { const hit = dayByCourseDate.get(`${cid}|${date}`); if (hit) { match = hit; break; } }
      // Keep any still-valid ids, then add the match (or drop the dangling ones).
      const kept = rel.filter((id) => idset.has(id));
      const value = match ? Array.from(new Set([...kept, match])) : kept;
      const action = match ? `relink → day ${match} (${date})` : `clear ${dangling.length} dead ref(s)${date ? ` (no class day on ${date})` : " (no date)"}`;
      updates.push({ ref: d.ref, field: relField, value, label: `${type}: "${title}"`, action });
    }
  }

  console.log(`=== REPAIR PLAN (${updates.length} record(s) with dangling refs) ===`);
  for (const u of updates) console.log(`  ${u.label.padEnd(60)} ${u.action}`);
  const relinked = updates.filter((u) => u.action.startsWith("relink")).length;
  console.log(`\nWould relink ${relinked}, clear ${updates.length - relinked}.`);

  if (!WRITE) { console.log(`\nDry run — nothing written. Re-run with --write to apply.`); return; }

  const now = FieldValue.serverTimestamp();
  let batch = db.batch(), ops = 0;
  for (const u of updates) {
    batch.update(u.ref, { [u.field]: u.value, updatedAt: now });
    if (++ops % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`\nRepaired ${updates.length} record(s).`);
}

run().catch((err) => { console.error(err); process.exit(1); });
