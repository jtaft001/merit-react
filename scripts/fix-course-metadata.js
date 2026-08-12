#!/usr/bin/env node
/**
 * Correct stale metadata on the teaching Course records.
 *
 * - IPC: the v1.2 manual is Period 4 (was "Period 3"), 180 school days
 *   (was 195), and the current phase label predates the day-by-day rebuild.
 * - LPSCS: v7 Phase 1 ends on Day 39 (currentUnit said "Days 1–43").
 *
 * Only the listed fields on the matched course are changed, and only when the
 * stored value differs. Dry run by default.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/fix-course-metadata.js            # preview
 *   node scripts/fix-course-metadata.js --write     # apply
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

const COLLECTION = "teaching";
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const WRITE = process.argv.includes("--write");

// code → { field: desiredValue }
const FIXES = {
  IPC: {
    period: "Period 4",
    totalDays: 180,
    currentUnit: "Phase 1: Scientific Foundations & Professional Practice (Days 1–18)",
  },
  LPSCS: {
    currentUnit: "Phase 1: Common Concepts (Days 1–39)",
  },
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
  const snap = await db.collection(COLLECTION).where("type", "==", "courses").get();

  const updates = [];
  for (const doc of snap.docs) {
    const x = doc.data();
    const code = String(x.code || "").toUpperCase();
    const fixes = FIXES[code];
    if (!fixes) continue;
    const changed = {};
    for (const [field, val] of Object.entries(fixes)) {
      if (x[field] !== val) changed[field] = { from: x[field], to: val };
    }
    if (Object.keys(changed).length) updates.push({ ref: doc.ref, code, changed });
  }

  console.log("=== COURSE METADATA FIXES ===");
  if (!updates.length) console.log("  (nothing to change — all values already correct)");
  for (const u of updates) {
    console.log(`  ${u.code}:`);
    for (const [f, { from, to }] of Object.entries(u.changed)) console.log(`    ${f}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
  }

  if (!WRITE) { console.log(`\nDry run — nothing written. Re-run with --write to apply.`); return; }
  if (!updates.length) return;

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  for (const u of updates) {
    const patch = { updatedAt: now };
    for (const [f, { to }] of Object.entries(u.changed)) patch[f] = to;
    batch.update(u.ref, patch);
  }
  await batch.commit();
  console.log(`\nUpdated ${updates.length} course record(s).`);
}

run().catch((err) => { console.error(err); process.exit(1); });
