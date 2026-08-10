#!/usr/bin/env node
/**
 * Rebuild the LPSCS (Intro to Law & Public Safety) lesson days from the v7
 * curriculum manual — the source of truth. Reads scripts/data/lpscs-v7-days.txt
 * (180 lines: "Day N (Weekday, Month DD, YYYY): Title"), assigns each day its
 * phase (v7 boundaries), date, and lesson type, and on --write REPLACES the
 * course's existing lesson days with these.
 *
 * Only LPSCS lesson days are touched (EMT / IPC / Wildfire are left alone).
 * Dry run by default.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/rebuild-lpscs-lessons.js            # preview all 180
 *   node scripts/rebuild-lpscs-lessons.js --write    # replace
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "data", "lpscs-v7-days.txt");
const COLLECTION = "teaching";
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const WRITE = process.argv.includes("--write");

const MONTHS = { January:1, February:2, March:3, April:4, May:5, June:6, July:7, August:8, September:9, October:10, November:11, December:12 };

// v7 phase boundaries (inclusive day numbers).
const PHASES = [
  [39, "Phase 1: Common Concepts"],
  [72, "Phase 2: Emergency Response"],
  [86, "Phase 3: Foundations of Law"],
  [101, "Phase 4: Justice & Juvenile"],
  [125, "Phase 5: Law Enforcement"],
  [138, "Phase 6: Corrections"],
  [151, "Phase 7: Court Advocacy"],
  [177, "Phase 8: Pathway Explorations"],
  [180, "Phase 9: Final Evaluations"],
];
function phaseFor(day) {
  for (const [end, name] of PHASES) if (day <= end) return name;
  return PHASES[PHASES.length - 1][1];
}

function typesFor(title) {
  const t = title.toLowerCase();
  if (/no period 2 class/.test(t)) return [];
  const out = new Set();
  if (/final exam|unit exam|unit assessment|final assessment|comprehensive assessment/.test(t)) out.add("Unit Exam");
  if (/\bquiz\b/.test(t)) out.add("Quiz");
  if (/review/.test(t)) out.add("Review");
  if (/scenario|simulation|mock|drill|role play|role-play|traffic stop|crime scene|\bcsi\b|tabletop/.test(t)) out.add("Scenario / Simulation");
  else if (/\blab\b|skills test|check-?off|dissection|hands-on/.test(t)) out.add("Skills Lab");
  if (/skit|showcase|presentation|\bproject\b|portfolio|poster|forum|newsletter|podcast|guide to interviews|debate/.test(t)) out.add("Project Work");
  if (out.size === 0) out.add("Lecture / Media");
  return [...out];
}

function parseDays() {
  const text = fs.readFileSync(DATA, "utf8");
  const re = /^Day (\d+) \((\w+), (\w+) (\d+), (\d+)\): (.*)$/;
  const rows = [];
  for (const line of text.split("\n")) {
    const m = line.match(re);
    if (!m) continue;
    const day = Number(m[1]);
    const month = MONTHS[m[3]];
    const dd = Number(m[4]);
    const yyyy = Number(m[5]);
    const title = m[6].trim();
    if (!month) { console.error("Unknown month in line:", line); process.exit(1); }
    rows.push({
      day,
      date: `${yyyy}-${String(month).padStart(2, "0")}-${String(dd).padStart(2, "0")}`,
      phase: phaseFor(day),
      lesson: `LPSCS D${day}: ${title}`,
      lessonType: typesFor(title),
    });
  }
  return rows;
}

function ts(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Timestamp.fromDate(new Date(y, m - 1, d));
}

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

async function run() {
  const rows = parseDays();
  if (rows.length !== 180) console.warn(`! Parsed ${rows.length} days (expected 180).`);

  initAdmin();
  const db = getFirestore();
  const courseSnap = await db.collection(COLLECTION).where("type", "==", "courses").get();
  const lpscsIds = courseSnap.docs
    .filter((d) => String(d.data().code || "").toUpperCase() === "LPSCS" || /lpscs|law.*public safety/i.test(String(d.data().course || "")))
    .map((d) => d.id);
  if (!lpscsIds.length) { console.error("No LPSCS course found. Aborting."); process.exit(1); }
  console.log(`LPSCS course id(s): ${lpscsIds.join(", ")}`);

  const lessonSnap = await db.collection(COLLECTION).where("type", "==", "lessonDays").get();
  const existing = lessonSnap.docs.filter((d) => {
    const c = d.data().course;
    return Array.isArray(c) && c.some((id) => lpscsIds.includes(id));
  });
  console.log(`Existing LPSCS lesson days: ${existing.length} (will be replaced).\n`);

  const counts = {};
  console.log("=== v7 LESSON DAYS ===");
  for (const r of rows) {
    counts[r.phase] = (counts[r.phase] || 0) + 1;
    console.log(`  ${r.date}  #${r.day}  ${r.phase.replace(/:.*/, "")}  ${r.lesson}`);
  }
  console.log("\n=== PER-PHASE COUNTS ===");
  for (const [, name] of PHASES) console.log(`  ${counts[name] || 0}  ${name}`);

  if (!WRITE) {
    console.log(`\nDry run — nothing written. Re-run with --write to replace ${existing.length} LPSCS lesson days with these ${rows.length}.`);
    return;
  }

  // Delete existing LPSCS lesson days.
  let batch = db.batch(); let ops = 0;
  for (const d of existing) { batch.delete(d.ref); if (++ops % 400 === 0) { await batch.commit(); batch = db.batch(); } }
  await batch.commit();
  console.log(`Deleted ${existing.length} existing LPSCS lesson days.`);

  // Create the v7 lesson days.
  const now = FieldValue.serverTimestamp();
  batch = db.batch(); ops = 0;
  for (const r of rows) {
    batch.set(db.collection(COLLECTION).doc(), {
      type: "lessonDays",
      course: lpscsIds.slice(0, 1),
      date: ts(r.date),
      dayNumber: r.day,
      phase: r.phase,
      lesson: r.lesson,
      lessonType: r.lessonType,
      scheduleType: "Regular Day",
      createdAt: now,
      updatedAt: now,
    });
    if (++ops % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`Created ${rows.length} LPSCS lesson days from v7.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
