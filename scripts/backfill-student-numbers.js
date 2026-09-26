#!/usr/bin/env node
/**
 * Copy the legacy `studentId` field (written by the old bulk-add script) into
 * `studentNumber` — the field the hall pass kiosk, time clock kiosk, and
 * student-ID sign-in look up. The Cloud Functions already fall back to
 * `studentId`, so this is cleanup, not a prerequisite. Also reports active
 * students with no school ID and IDs shared by more than one student.
 *
 * Dry run by default. --write applies.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/backfill-student-numbers.js           # preview
 *   node scripts/backfill-student-numbers.js --write   # apply
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const WRITE = process.argv.slice(2).includes("--write");

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
  const snap = await db.collection("students").get();
  const active = snap.docs.filter((d) => String(d.data().status || "").toLowerCase() !== "dropped");

  const toCopy = [];
  const missing = [];
  const byId = new Map();

  for (const d of active) {
    const s = d.data();
    const number = String(s.studentNumber || "").trim();
    const legacy = String(s.studentId || "").trim();
    const effective = number || legacy;
    if (!number && legacy) toCopy.push({ ref: d.ref, name: s.name || d.id, legacy });
    if (!effective) missing.push(s.name || d.id);
    else byId.set(effective, [...(byId.get(effective) || []), s.name || d.id]);
  }

  console.log(`${active.length} active student(s).`);
  console.log(`\n${toCopy.length} to backfill (studentId → studentNumber):`);
  toCopy.forEach((r) => console.log(`  ${r.name}: ${r.legacy}`));

  if (missing.length) {
    console.log(`\n⚠ ${missing.length} active student(s) have NO school ID (set one on Settings → Students):`);
    missing.forEach((n) => console.log(`  ${n}`));
  }
  const dups = [...byId].filter(([, names]) => names.length > 1);
  if (dups.length) {
    console.log(`\n⚠ ${dups.length} school ID(s) shared by multiple students (only one will match):`);
    dups.forEach(([id, names]) => console.log(`  ${id}: ${names.join(", ")}`));
  }

  if (!WRITE) { console.log("\nDry run — re-run with --write to apply."); return; }

  let batch = db.batch();
  let ops = 0;
  for (const r of toCopy) {
    batch.update(r.ref, { studentNumber: r.legacy });
    if (++ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops) await batch.commit();
  console.log(`\n✓ Backfilled ${toCopy.length} student(s).`);
}

run().catch((err) => { console.error(err); process.exit(1); });
