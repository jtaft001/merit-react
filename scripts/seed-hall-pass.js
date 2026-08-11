#!/usr/bin/env node
/**
 * Seed the hall pass feature:
 *   1. Create/merge settings/hallPass with the defaults.
 *   2. Seed passesRemaining = passesPerSemester on every active student.
 * Also reports active students missing a studentNumber (they can't use the
 * kiosk until one is set).
 *
 * Dry run by default. --write applies. --semester "2026-fall" sets the term.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/seed-hall-pass.js --semester 2026-fall            # preview
 *   node scripts/seed-hall-pass.js --semester 2026-fall --write    # apply
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const semIdx = args.indexOf("--semester");
const SEMESTER = semIdx >= 0 ? String(args[semIdx + 1] || "") : "";

const DEFAULTS = {
  passesPerSemester: 5,
  pointsPerUnusedPass: 50,
  oneOutAtATime: false,
  exemptDestinations: ["nurse", "office", "counselor"],
};

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

  const settingsSnap = await db.collection("settings").doc("hallPass").get();
  const existing = settingsSnap.exists ? settingsSnap.data() : {};
  const currentSemester = SEMESTER || existing.currentSemester || "2026-fall";
  const passesPerSemester = existing.passesPerSemester || DEFAULTS.passesPerSemester;

  const studentsSnap = await db.collection("students").get();
  const active = studentsSnap.docs.filter((d) => String(d.data().status || "").toLowerCase() !== "dropped");
  const missingId = active.filter((d) => !String(d.data().studentNumber || "").trim());

  console.log(`Settings/hallPass: currentSemester="${currentSemester}", passesPerSemester=${passesPerSemester}`);
  console.log(`Active students: ${active.length} — will seed passesRemaining=${passesPerSemester} on each.`);
  if (missingId.length) {
    console.log(`\n⚠ ${missingId.length} active student(s) have NO studentNumber (can't use the kiosk):`);
    missingId.slice(0, 40).forEach((d) => console.log(`   - ${d.data().name || d.id}`));
    if (missingId.length > 40) console.log(`   …and ${missingId.length - 40} more.`);
  }

  if (!WRITE) { console.log("\nDry run — nothing written. Re-run with --write."); return; }

  await db.collection("settings").doc("hallPass").set(
    { ...DEFAULTS, ...existing, currentSemester, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  console.log("Wrote settings/hallPass.");

  let n = 0;
  let batch = db.batch();
  for (const d of active) {
    batch.update(d.ref, { passesRemaining: passesPerSemester });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`Seeded passesRemaining on ${n} students.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
