#!/usr/bin/env node
/**
 * Replace the Teaching HQ "District Calendar" with the official PUSD 2026-27
 * dates (School-Wide + 9-12 / PHS), from "Updated District Calendars 2026-27.pdf".
 *
 * Deletes existing districtCalendar records only, then adds the ones below.
 * Nothing else in the `teaching` collection is touched. Idempotent — safe to
 * re-run. Needs firebase-admin creds (same as the migration):
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/import-district-calendar.js            # replace
 *   node scripts/import-district-calendar.js --dry-run  # print, write nothing
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

const COLLECTION = "teaching";
const RECORD_TYPE = "districtCalendar";
const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const DRY = process.argv.includes("--dry-run");

// [event, date (YYYY-MM-DD), eventType, studentsPresent, instructionalImpact].
// eventType maps to the schema's "Type" select. affectsPacingFor is "All".
const EVENTS = [
  ["Teacher Work Day", "2026-08-11", "Teacher Work / PD Day", false, "No school for students."],
  ["First Day of School", "2026-08-12", "First / Last Day", true, ""],
  ["Labor Day", "2026-09-07", "Holiday / No School", false, ""],
  ["Veterans' Day", "2026-11-11", "Holiday / No School", false, ""],
  ["Thanksgiving Break", "2026-11-23", "Break", false, "No school Nov 23–27, 2026."],
  ["Finals — Minimum Day (9–12)", "2026-12-17", "Final Exams", true, "Minimum day; 9–12 finals."],
  ["Finals — Minimum Day (9–12)", "2026-12-18", "Final Exams", true, "Minimum day; 9–12 finals."],
  ["End of 1st Semester", "2026-12-19", "Semester / Trimester Boundary", false, "1st semester ends (85 days)."],
  ["Winter Break", "2026-12-22", "Break", false, "No school Dec 22, 2026 – Jan 1, 2027."],
  ["Martin Luther King, Jr. Day", "2027-01-18", "Holiday / No School", false, ""],
  ["Lincoln's Birthday (observed)", "2027-02-12", "Holiday / No School", false, ""],
  ["Presidents' Day / Washington's Birthday", "2027-02-15", "Holiday / No School", false, ""],
  ["Potential Make-Up Day", "2027-03-18", "Contingency Make-Up Day", false, "No school unless a prior day was canceled."],
  ["Potential Make-Up Day", "2027-03-19", "Contingency Make-Up Day", false, "No school unless a prior day was canceled."],
  ["Staff Development Day", "2027-03-22", "Teacher Work / PD Day", false, "No school for students."],
  ["Potential Make-Up Day", "2027-03-26", "Contingency Make-Up Day", false, "No school unless a prior day was canceled."],
  ["Spring Break", "2027-03-29", "Break", false, "No school Mar 29 – Apr 2, 2027."],
  ["Potential Make-Up Day", "2027-05-28", "Contingency Make-Up Day", false, "No school unless a prior day was canceled."],
  ["Memorial Day", "2027-05-31", "Holiday / No School", false, ""],
  ["Finals — Minimum Day (9–12)", "2027-06-01", "Final Exams", true, "Minimum day; 9–12 finals."],
  ["Last Day of School — End of 2nd Semester", "2027-06-02", "First / Last Day", true, "Minimum day; 9–12 finals; 2nd semester ends (95 days)."],
  ["PHS & eLearning Graduation", "2027-06-03", "", false, "Graduation ceremony."],
  ["Teacher Work Day", "2027-06-03", "Teacher Work / PD Day", false, "No school for students."],
];

function ts(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Timestamp.fromDate(new Date(y, m - 1, d));
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
  if (DRY) {
    console.log(`Dry run — ${EVENTS.length} district calendar events:`);
    for (const [event, date, eventType] of EVENTS) {
      console.log(`  ${date}  ${eventType || "(no type)"}  ${event}`);
    }
    console.log("Nothing written.");
    return;
  }

  initAdmin();
  const db = getFirestore();

  // Remove existing districtCalendar docs only; leave every other type alone.
  const existing = await db.collection(COLLECTION).where("type", "==", RECORD_TYPE).get();
  const delBatch = db.batch();
  existing.docs.forEach((d) => delBatch.delete(d.ref));
  await delBatch.commit();
  console.log(`Removed ${existing.size} existing districtCalendar records.`);

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  for (const [event, date, eventType, studentsPresent, instructionalImpact] of EVENTS) {
    const doc = {
      type: RECORD_TYPE,
      event,
      date: ts(date),
      studentsPresent,
      affectsPacingFor: ["All"],
      createdAt: now,
      updatedAt: now,
    };
    if (eventType) doc.eventType = eventType;
    if (instructionalImpact) doc.instructionalImpact = instructionalImpact;
    batch.set(db.collection(COLLECTION).doc(), doc);
  }
  await batch.commit();
  console.log(`Added ${EVENTS.length} district calendar records.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
