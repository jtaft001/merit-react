#!/usr/bin/env node
/**
 * Set up the complete LPSCS lesson-plan set from the Law & Public Safety plan
 * folder. For each of the 23 plans: find (or create) its LPSCS-course lesson
 * plan record, then upload the PDF to Firebase Storage and set the record's
 * `pdf` field. Existing PDFs on these records are overwritten.
 *
 * Dry run by default. --write applies.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/setup-lpscs-plans.js "/path/to/plan/folder"           # preview
 *   node scripts/setup-lpscs-plans.js "/path/to/plan/folder" --write   # apply
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import path from "path";
import fs from "fs";
import os from "os";
import { randomUUID } from "crypto";

const COLLECTION = "teaching";
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const BUCKET = process.env.STORAGE_BUCKET || "merit-ems.firebasestorage.app";
const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const FOLDER = args.find((a) => !a.startsWith("--")) || path.join(os.homedir(), "Downloads");

// [pdf filename, LPSCS plan record title]. Titles match existing records where
// they exist; the 4 new ones (Conflict, Listening, both Interviews) are created.
const PLANS = [
  ["A Job Defined_Chief of Police_Lesson_Plan.pdf", "A Job Defined: Chief of Police"],
  ["A Job Defined_Emergency Dispatcher.pdf", "A Job Defined: Emergency Dispatcher"],
  ["A Job Defined_Emergency Medical Technician.pdf", "A Job Defined: Emergency Medical Technician"],
  ["A Job Defined_Police Officer.pdf", "A Job Defined: Police Officer"],
  ["Conflict Management_Lesson_Plan.pdf", "Conflict Management"],
  ["Correction Services_Lesson_Plan.pdf", "Correction Services"],
  ["Court Systems & Structures_Lesson_Plan.pdf", "Court Systems & Structures"],
  ["Criminal Law History & Development_Lesson_Plan.pdf", "Criminal Law History & Development"],
  ["Emergency & Fire Management Services_Lesson_Plan.pdf", "Emergency & Fire Management Services"],
  ["Ethical Practices in Law, Public Safety, Corrections & Security_Lesson_Plan.pdf", "Ethical Practices in Law / Public Safety / Corrections & Security"],
  ["First Aid Basics_Lesson_Plan.pdf", "First Aid Basics"],
  ["Formulas for Career Success_The Interview Process_Lesson Plan.pdf", "Formulas for Career Success: The Interview Process"],
  ["Fundamentals of Laws & Codes_Lesson_Plan.pdf", "Fundamentals of Laws & Codes"],
  ["Interagency Cooperation_Lesson_Plan.pdf", "Interagency Cooperation"],
  ["Law Enforcement Services_Lesson_Plan.pdf", "Law Enforcement Services"],
  ["Legal Services_Lesson_Plan.pdf", "Legal Services"],
  ["Lesson Plan - Exploring Careers Law, Public Safety, Corrections & Security.pdf", "Exploring Careers: Law / Public Safety / Corrections & Security"],
  ["Lesson Plan - Formulas for Career Success_Interview Preparation Lesson Plan.pdf", "Formulas for Career Success: Interview Preparation"],
  ["Listening 101_Lesson_Plan.pdf", "Listening 101"],
  ["Private Security Systems & Agencies_Lesson_Plan.pdf", "Private Security Systems & Agencies"],
  ["Public Safety Systems & Agencies_Lesson_Plan.pdf", "Public Safety Systems & Agencies"],
  ["Security & Protective Services_Lesson_Plan.pdf", "Security & Protective Services"],
  ["The Correctional System_Lesson_Plan.pdf", "The Correctional System"],
];

function initAdmin() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT;
  const opts = { projectId: PROJECT_ID, storageBucket: BUCKET };
  if (credPath) {
    const resolved = path.resolve(credPath);
    if (!fs.existsSync(resolved)) { console.error("Credential file not found:", resolved); process.exit(1); }
    initializeApp({ credential: cert(resolved), ...opts });
  } else {
    initializeApp({ credential: applicationDefault(), ...opts });
  }
}

async function run() {
  if (!fs.existsSync(FOLDER)) { console.error("Folder not found:", FOLDER); process.exit(1); }
  // Verify every PDF is present up front.
  const missingFiles = PLANS.filter(([f]) => !fs.existsSync(path.join(FOLDER, f))).map(([f]) => f);
  if (missingFiles.length) { console.error("Missing PDF files in folder:\n  " + missingFiles.join("\n  ")); process.exit(1); }

  initAdmin();
  const db = getFirestore();
  const snap = await db.collection(COLLECTION).get();

  let lpscsId = null;
  const plansByTitle = new Map(); // lowerTitle -> {id, ref, course}
  snap.docs.forEach((d) => {
    const x = d.data();
    if (x.type === "courses" && (String(x.code || "").toUpperCase() === "LPSCS" || /law.*public safety|lpscs/i.test(String(x.course || "")))) lpscsId = d.id;
    if (x.type === "lessonPlans") plansByTitle.set(String(x.lessonPlan || "").toLowerCase(), { id: d.id, ref: d.ref, course: Array.isArray(x.course) ? x.course : [] });
  });
  if (!lpscsId) { console.error("No LPSCS course found. Aborting."); process.exit(1); }
  console.log(`LPSCS course id: ${lpscsId}\n`);

  const actions = PLANS.map(([file, title]) => {
    const rec = plansByTitle.get(title.toLowerCase());
    let action = "create";
    if (rec) action = rec.course.includes(lpscsId) ? "update" : "adopt"; // adopt = add LPSCS to course
    return { file, title, rec, action };
  });

  console.log("=== PLAN RECORDS ===");
  for (const a of actions) console.log(`  ${a.action.toUpperCase().padEnd(6)} ${a.title}  ←  ${a.file}`);
  const creates = actions.filter((a) => a.action === "create").length;
  console.log(`\n${actions.length} plans: ${creates} to create, ${actions.length - creates} existing. All ${actions.length} PDFs will upload.`);

  if (!WRITE) { console.log("\nDry run — nothing written. Re-run with --write."); return; }

  const bucket = getStorage().bucket();
  const now = FieldValue.serverTimestamp();
  let done = 0;
  const failed = [];
  for (const a of actions) {
    try {
      // Resolve / create the record ref.
      let ref = a.rec ? a.rec.ref : db.collection(COLLECTION).doc();
      if (a.action === "create") {
        await ref.set({ type: "lessonPlans", lessonPlan: a.title, course: [lpscsId], planStatus: "Not started", createdAt: now, updatedAt: now });
      } else if (a.action === "adopt") {
        await ref.update({ course: [...new Set([...a.rec.course, lpscsId])], updatedAt: now });
      }
      // Upload the PDF.
      const local = path.join(FOLDER, a.file);
      const dest = `teaching/plans/${ref.id}/${Date.now()}-${a.file.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
      const token = randomUUID();
      await bucket.upload(local, { destination: dest, metadata: { contentType: "application/pdf", metadata: { firebaseStorageDownloadTokens: token } } });
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
      const size = fs.statSync(local).size;
      await ref.update({ pdf: { path: dest, name: a.file, size, url, contentType: "application/pdf" }, updatedAt: now });
      done++;
      console.log(`  ✓ ${a.title}`);
    } catch (err) {
      failed.push(a.title);
      console.error(`  ✗ ${a.title}: ${err && err.message ? err.message : err}`);
    }
  }
  console.log(`\nDone. ${done}/${actions.length} plans set up.`);
  if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
}

run().catch((err) => { console.error(err); process.exit(1); });
