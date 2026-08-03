#!/usr/bin/env node
/**
 * Assign the LPSCS curriculum "Phase" to each Law & Public Safety lesson day,
 * from the 9-phase master schedule in curriculum-manual-v5. Each lesson is
 * tagged by which phase's date range its Date falls in (with a Day # fallback).
 *
 * Dry run by default (prints assignments); --write to save.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/assign-lpscs-phases.js            # preview
 *   node scripts/assign-lpscs-phases.js --write    # save the phase field
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

const COLLECTION = "teaching";
const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const WRITE = process.argv.includes("--write");

// [value, dateStart, dateEnd (inclusive), dayStart, dayEnd]
const PHASES = [
  ["Phase 1: Common Concepts", "2026-08-12", "2026-10-12", 1, 43],
  ["Phase 2: Emergency Response", "2026-10-13", "2026-11-30", 44, 72],
  ["Phase 3: Foundations of Law", "2026-12-01", "2026-12-18", 73, 86],
  ["Phase 4: Justice & Juvenile", "2027-01-04", "2027-01-25", 87, 101],
  ["Phase 5: Law Enforcement", "2027-01-26", "2027-03-01", 102, 124],
  ["Phase 6: Corrections", "2027-03-02", "2027-03-25", 125, 139],
  ["Phase 7: Court Advocacy", "2027-04-05", "2027-04-26", 140, 155],
  ["Phase 8: Pathway Explorations", "2027-04-27", "2027-06-01", 156, 179],
  ["Phase 9: Final Evaluations", "2027-06-02", "2027-06-02", 180, 180],
];

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function phaseFor(dateStr, dayNum) {
  if (dateStr) {
    const hit = PHASES.find(([, s, e]) => dateStr >= s && dateStr <= e);
    if (hit) return { value: hit[0], by: "date" };
  }
  if (typeof dayNum === "number") {
    const hit = PHASES.find(([, , , ds, de]) => dayNum >= ds && dayNum <= de);
    if (hit) return { value: hit[0], by: "day#" };
  }
  return null;
}

function initAdmin() {
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (credPath) {
    const resolved = path.resolve(credPath);
    if (!fs.existsSync(resolved)) {
      console.error("Credential file not found:", resolved);
      process.exit(1);
    }
    initializeApp({ credential: cert(resolved), projectId: PROJECT_ID });
  } else {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
}

async function run() {
  initAdmin();
  const db = getFirestore();

  // Find the LPSCS course record(s).
  const courseSnap = await db.collection(COLLECTION).where("type", "==", "courses").get();
  const lpscsIds = courseSnap.docs
    .filter((d) => {
      const c = d.data();
      return String(c.code || "").toUpperCase() === "LPSCS" ||
        /lpscs|law.*public safety/i.test(String(c.course || ""));
    })
    .map((d) => d.id);

  if (lpscsIds.length === 0) {
    console.error("No LPSCS course found (looked for code 'LPSCS'). Aborting.");
    process.exit(1);
  }
  console.log(`LPSCS course id(s): ${lpscsIds.join(", ")}\n`);

  // All lesson days linked to an LPSCS course.
  const lessonSnap = await db.collection(COLLECTION).where("type", "==", "lessonDays").get();
  const lessons = lessonSnap.docs
    .map((d) => {
      const data = d.data();
      const course = Array.isArray(data.course) ? data.course : [];
      const date = data.date && data.date.toDate ? ymd(data.date.toDate()) : null;
      return { id: d.id, lesson: String(data.lesson || "(untitled)"), date, dayNumber: data.dayNumber, course };
    })
    .filter((l) => l.course.some((id) => lpscsIds.includes(id)))
    .sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));

  console.log(`Found ${lessons.length} LPSCS lesson days.\n`);

  const toWrite = [];
  const unassigned = [];
  const counts = {};
  for (const l of lessons) {
    const p = phaseFor(l.date, l.dayNumber);
    if (!p) { unassigned.push(l); continue; }
    counts[p.value] = (counts[p.value] || 0) + 1;
    toWrite.push({ ...l, phase: p.value, by: p.by });
  }

  console.log("=== ASSIGNMENTS ===");
  for (const l of toWrite) {
    console.log(`  ${l.date || "(no date)"}  #${l.dayNumber ?? "?"}  [${l.by}]  ${l.phase}\n         ${l.lesson}`);
  }
  console.log("\n=== PER-PHASE COUNTS ===");
  for (const p of PHASES) console.log(`  ${counts[p[0]] || 0}  ${p[0]}`);
  if (unassigned.length) {
    console.log(`\n=== UNASSIGNED (${unassigned.length}) — no matching date or day # ===`);
    for (const l of unassigned) console.log(`  ${l.date || "(no date)"}  #${l.dayNumber ?? "?"}  ${l.lesson}`);
  }

  if (!WRITE) {
    console.log(`\nDry run — nothing written. Re-run with --write to save the phase on ${toWrite.length} lessons.`);
    return;
  }

  const now = FieldValue.serverTimestamp();
  let batch = db.batch();
  let n = 0;
  for (const l of toWrite) {
    batch.update(db.collection(COLLECTION).doc(l.id), { phase: l.phase, updatedAt: now });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`\nWrote phase to ${n} LPSCS lesson days.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
