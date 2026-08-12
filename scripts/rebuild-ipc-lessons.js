#!/usr/bin/env node
/**
 * Rebuild the Intro to Patient Care (IPC) lesson days from the v1.2 curriculum
 * manual — the source of truth — as a full DAY-BY-DAY plan (replacing the old
 * week-by-week build). Reads scripts/data/ipc-days.json (180 entries, each with
 * day, date, weekday, title, phase, lessonType, bellRinger, exitTicket) and on
 * --write REPLACES the IPC course's existing lesson days with these 180.
 *
 * Each new lesson day carries its phase, lesson type, Bell Work, and Exit Ticket
 * (the two boxes shown on the Daily Dashboard) and a schedule type derived from
 * the weekday / finals calendar.
 *
 * Only IPC lesson days are touched (LPSCS / EMT / Wildfire are left alone).
 * Dry run by default.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/rebuild-ipc-lessons.js            # preview all 180
 *   node scripts/rebuild-ipc-lessons.js --write    # replace
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "data", "ipc-days.json");
const COLLECTION = "teaching";
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const WRITE = process.argv.includes("--write");

function scheduleTypeFor(day, weekday) {
  if (day === 85 || day === 179) return "Minimum Day";      // Period 4 does not meet (Periods 1-3 test)
  if (day === 86 || day === 180) return "Final Exam Block"; // Period 4 sits its final
  if (weekday === "Wednesday") return "Wednesday PLC / Late Start";
  return "Regular Day";
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

/** Guard the destructive --write path: bail before touching Firestore if the
 *  data file is malformed. */
function validate(rows) {
  const errs = [];
  if (!Array.isArray(rows)) return ["ipc-days.json is not an array."];
  if (rows.length !== 180) errs.push(`Expected 180 days, got ${rows.length}.`);
  const seenDay = new Set(), seenDate = new Set();
  for (const r of rows) {
    const at = `day ${r?.day ?? "?"}`;
    if (!Number.isInteger(r?.day) || r.day < 1 || r.day > 180) errs.push(`${at}: bad day number.`);
    else if (seenDay.has(r.day)) errs.push(`${at}: duplicate day number.`);
    else seenDay.add(r.day);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r?.date || "")) errs.push(`${at}: bad date ${JSON.stringify(r?.date)}.`);
    else if (seenDate.has(r.date)) errs.push(`${at}: duplicate date ${r.date}.`);
    else seenDate.add(r.date);
    if (!r?.title || !String(r.title).trim()) errs.push(`${at}: missing title.`);
    if (!r?.phase) errs.push(`${at}: missing phase.`);
    if (r?.lessonType && !Array.isArray(r.lessonType)) errs.push(`${at}: lessonType must be an array.`);
  }
  return errs;
}

async function run() {
  const rows = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const errs = validate(rows);
  if (errs.length) {
    console.error(`Refusing to run — ${path.basename(DATA)} is invalid:`);
    for (const e of errs.slice(0, 20)) console.error(`  • ${e}`);
    process.exit(1);
  }

  initAdmin();
  const db = getFirestore();

  const courseSnap = await db.collection(COLLECTION).where("type", "==", "courses").get();
  const ipcIds = courseSnap.docs
    .filter((d) => String(d.data().code || "").toUpperCase() === "IPC" || /patient care/i.test(String(d.data().course || "")))
    .map((d) => d.id);
  if (!ipcIds.length) { console.error("No IPC course found (code 'IPC' / 'Patient Care'). Aborting."); process.exit(1); }
  console.log(`IPC course id(s): ${ipcIds.join(", ")}`);

  const lessonSnap = await db.collection(COLLECTION).where("type", "==", "lessonDays").get();
  const existing = lessonSnap.docs.filter((d) => {
    const c = d.data().course;
    return Array.isArray(c) && c.some((id) => ipcIds.includes(id));
  });
  console.log(`Existing IPC lesson days: ${existing.length} (will be replaced).\n`);

  const counts = {};
  console.log("=== v1.2 DAY-BY-DAY LESSON DAYS ===");
  for (const r of rows) {
    counts[r.phase] = (counts[r.phase] || 0) + 1;
    const st = scheduleTypeFor(r.day, r.weekday);
    console.log(`  ${r.date}  #${String(r.day).padStart(3)}  ${r.phase.replace(/:.*/, "")}  ${st.padEnd(24)}  IPC D${r.day}: ${r.title}`);
  }
  console.log("\n=== PER-PHASE COUNTS ===");
  for (const [name, n] of Object.entries(counts)) console.log(`  ${String(n).padStart(3)}  ${name}`);
  const withBell = rows.filter((r) => r.bellRinger).length;
  const withExit = rows.filter((r) => r.exitTicket).length;
  console.log(`\nBell Work on ${withBell}/180 · Exit Ticket on ${withExit}/180.`);

  if (!WRITE) {
    console.log(`\nDry run — nothing written. Re-run with --write to replace ${existing.length} IPC lesson days with these ${rows.length}.`);
    return;
  }

  // Delete existing IPC lesson days.
  let batch = db.batch(); let ops = 0;
  for (const d of existing) { batch.delete(d.ref); if (++ops % 400 === 0) { await batch.commit(); batch = db.batch(); } }
  await batch.commit();
  console.log(`Deleted ${existing.length} existing IPC lesson days.`);

  // Create the v1.2 day-by-day lesson days.
  const now = FieldValue.serverTimestamp();
  batch = db.batch(); ops = 0;
  for (const r of rows) {
    batch.set(db.collection(COLLECTION).doc(), {
      type: "lessonDays",
      course: ipcIds.slice(0, 1),
      date: ts(r.date),
      dayNumber: r.day,
      phase: r.phase,
      lesson: `IPC D${r.day}: ${r.title}`,
      lessonType: r.lessonType || [],
      bellRinger: r.bellRinger || "",
      exitTicket: r.exitTicket || "",
      scheduleType: scheduleTypeFor(r.day, r.weekday),
      createdAt: now,
      updatedAt: now,
    });
    if (++ops % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`Created ${rows.length} IPC lesson days (day-by-day) from v1.2.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
