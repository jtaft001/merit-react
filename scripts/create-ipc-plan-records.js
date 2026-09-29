#!/usr/bin/env node
/**
 * Create Lesson Plan records under Intro to Patient Care (IPC) for the leftover
 * PDFs that had no matching plan. After this runs, bulk-upload-plan-pdfs.js
 * (with the matching overrides) attaches each PDF.
 *
 * Idempotent: skips a title that already exists. Dry-run by default.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/create-ipc-plan-records.js            # preview
 *   node scripts/create-ipc-plan-records.js --write    # create
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

const COLLECTION = "teaching";
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const WRITE = process.argv.includes("--write");

// New IPC lesson plans to create (titles the bulk uploader's overrides map to).
const TITLES = [
  "IPC — Conflict Management",
  "IPC — Listening 101",
  "IPC — Formulas for Career Success: Interview Preparation",
  "IPC — Formulas for Career Success: The Interview Process",
  "IPC — MA Skills: First Aid Basics",
  "IPC — Skills for Health Science Professionals: CPR & AED",
  "IPC — Health Science Professionalism: Leadership",
];

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
  initAdmin();
  const db = getFirestore();

  const snap = await db.collection(COLLECTION).get();
  let ipcId = null;
  const existingTitles = new Set();
  snap.docs.forEach((d) => {
    const x = d.data();
    if (x.type === "courses" && (String(x.code || "").toUpperCase() === "IPC" || /patient care/i.test(String(x.course || "")))) ipcId = d.id;
    if (x.type === "lessonPlans") existingTitles.add(String(x.lessonPlan || "").toLowerCase());
  });
  if (!ipcId) { console.error("No IPC course found (code 'IPC' / 'Patient Care'). Aborting."); process.exit(1); }
  console.log(`IPC course id: ${ipcId}\n`);

  const toCreate = TITLES.filter((t) => !existingTitles.has(t.toLowerCase()));
  const skipped = TITLES.filter((t) => existingTitles.has(t.toLowerCase()));

  console.log("=== WILL CREATE ===");
  toCreate.forEach((t) => console.log(`  + ${t}`));
  if (skipped.length) { console.log("\n=== ALREADY EXISTS (skip) ==="); skipped.forEach((t) => console.log(`  = ${t}`)); }

  if (!WRITE) { console.log(`\nDry run — nothing written. Re-run with --write to create ${toCreate.length} IPC lesson plans.`); return; }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  for (const title of toCreate) {
    batch.set(db.collection(COLLECTION).doc(), {
      type: "lessonPlans",
      lessonPlan: title,
      course: [ipcId],
      planStatus: "Not started",
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch.commit();
  console.log(`\nCreated ${toCreate.length} IPC lesson plan records.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
