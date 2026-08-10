#!/usr/bin/env node
/**
 * Bulk-upload lesson-plan PDFs. Matches each PDF file in a folder to a Lesson
 * Plan record (by fuzzy title), uploads it to Firebase Storage under
 * teaching/plans/<planId>/, and sets the plan's `pdf` field — exactly what the
 * in-app uploader produces, so clicking a lesson opens the PDF.
 *
 * Dry run by default (prints proposed matches + unmatched). --write uploads.
 * By default it skips plans that already have a PDF; pass --overwrite to replace.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/bulk-upload-plan-pdfs.js "/path/to/pdf/folder"            # preview
 *   node scripts/bulk-upload-plan-pdfs.js "/path/to/pdf/folder" --write    # upload
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
const THRESHOLD = 0.4;

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const OVERWRITE = args.includes("--overwrite");
const folderArg = args.find((a) => !a.startsWith("--"));
const FOLDER = folderArg || path.join(os.homedir(), "Downloads");

// Manual matches, filled after reviewing a dry run: "file.pdf": "Exact Plan Title"
// (or null to skip a file).
const OVERRIDES = {
  // Corrected targets:
  "Lesson Plan - Medical Assistant Skills_Patient Prep.pdf": "IPC — MA Skills: Patient Prep",
  "Lesson Plan - Skills for Health Science Professionals_Activities of Daily Living.pdf": "IPC — Skills for Health Science Professionals: ADLs",
  // Duplicate file:
  "First Aid Basics_Lesson_Plan copy.pdf": null,
  // No matching lesson-plan record yet — skip so they don't clobber a shared plan:
  "Lesson Plan - Medical Assistant Skills_First Aid Basics.pdf": null,
  "Lesson Plan - Skills for Health Science Professionals_CPR & AED.pdf": null,
  "Lesson Plan - Health Science Professionalism_ Leadership Lesson Plan.pdf": null,
};

const STOP = new Set(["the","a","an","of","in","for","and","to","on","s","lesson","plan","pdf","ipc","lpscs","emt","wild","skills","ma"]);
function tokens(s) {
  return new Set(
    String(s).toLowerCase()
      .replace(/\.pdf$/i, "")
      .replace(/^[a-z]{2,6}\s*[—-]\s*/i, "") // strip "IPC — " plan prefix
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ").filter((w) => w && !STOP.has(w))
  );
}
function score(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

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
  const files = fs.readdirSync(FOLDER).filter((f) => f.toLowerCase().endsWith(".pdf"));
  console.log(`Found ${files.length} PDF files in ${FOLDER}\n`);
  if (!files.length) process.exit(0);

  initAdmin();
  const db = getFirestore();
  const snap = await db.collection(COLLECTION).where("type", "==", "lessonPlans").get();
  const plans = snap.docs.map((d) => ({ id: d.id, ref: d.ref, title: String(d.data().lessonPlan || ""), hasPdf: !!(d.data().pdf && d.data().pdf.url), tokens: tokens(d.data().lessonPlan || "") }));
  console.log(`Loaded ${plans.length} Lesson Plan records.\n`);

  const matches = [];   // {file, plan, score}
  const unmatched = [];
  const used = new Map();
  for (const file of files) {
    if (file in OVERRIDES) {
      const t = OVERRIDES[file];
      if (t === null) continue;
      const p = plans.find((x) => x.title.toLowerCase() === String(t).toLowerCase());
      if (p) { matches.push({ file, plan: p, score: 1 }); used.set(p.id, (used.get(p.id)||0)+1); continue; }
    }
    const ft = tokens(file);
    let best = null, bestScore = 0;
    for (const p of plans) { const sc = score(ft, p.tokens); if (sc > bestScore) { bestScore = sc; best = p; } }
    if (best && bestScore >= THRESHOLD) { matches.push({ file, plan: best, score: bestScore }); used.set(best.id, (used.get(best.id)||0)+1); }
    else unmatched.push({ file, best, bestScore });
  }

  console.log(`=== MATCHES (${matches.length}) ===`);
  for (const m of matches.sort((a,b)=>b.score-a.score)) {
    const dupe = used.get(m.plan.id) > 1 ? "  ⚠ shared plan" : "";
    const has = m.plan.hasPdf ? (OVERWRITE ? "  (will overwrite existing PDF)" : "  (already has PDF — will SKIP)") : "";
    console.log(`  ${m.score.toFixed(2)}  ${m.file}\n          → ${m.plan.title}${dupe}${has}`);
  }
  if (unmatched.length) {
    console.log(`\n=== NO CONFIDENT MATCH (${unmatched.length}) — add to OVERRIDES ===`);
    for (const u of unmatched) console.log(`  ${u.file}\n          best (${u.bestScore.toFixed(2)}): ${u.best ? u.best.title : "—"}`);
  }

  const willUpload = matches.filter((m) => OVERWRITE || !m.plan.hasPdf);
  if (!WRITE) {
    console.log(`\nDry run — nothing uploaded. Re-run with --write to upload ${willUpload.length} PDF(s).`);
    return;
  }

  const bucket = getStorage().bucket();
  const now = FieldValue.serverTimestamp();
  let done = 0;
  const failed = [];
  for (const m of willUpload) {
    try {
      const local = path.join(FOLDER, m.file);
      const dest = `teaching/plans/${m.plan.id}/${Date.now()}-${m.file.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
      const token = randomUUID();
      await bucket.upload(local, {
        destination: dest,
        metadata: { contentType: "application/pdf", metadata: { firebaseStorageDownloadTokens: token } },
      });
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
      const size = fs.statSync(local).size;
      await m.plan.ref.update({ pdf: { path: dest, name: m.file, size, url, contentType: "application/pdf" }, updatedAt: now });
      done++;
      console.log(`  ✓ ${m.file} → ${m.plan.title}`);
    } catch (err) {
      failed.push(m.file);
      console.error(`  ✗ ${m.file}: ${err && err.message ? err.message : err}`);
    }
  }
  console.log(`\nUploaded and linked ${done} PDF(s).`);
  if (failed.length) console.log(`${failed.length} failed: ${failed.join(", ")}`);
}

run().catch((err) => { console.error(err); process.exit(1); });
