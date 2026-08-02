#!/usr/bin/env node
/**
 * Attach markdown lesson-plan files to the matching Teaching HQ "Lesson Plans"
 * records by loading each file's text into the record's `content` field.
 *
 * Files are matched to records by fuzzy title (token overlap). Runs as a
 * DRY RUN by default — it prints the proposed filename → record pairs and any
 * unmatched files, and writes nothing. Add --write to actually save.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/attach-lesson-plans.js [folder]              # dry run
 *   node scripts/attach-lesson-plans.js [folder] --write      # save content
 *
 * Default folder: ~/Downloads/introduction-to-patient-care
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";
import os from "os";

const COLLECTION = "teaching";
const TYPE = "lessonPlans";
const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const LIST = args.includes("--list");
const THRESHOLD = 0.45; // minimum token-overlap score to auto-attach
const folderArg = args.find((a) => !a.startsWith("--"));
const FOLDER = folderArg || path.join(os.homedir(), "Downloads", "introduction-to-patient-care");

// Files that aren't lesson plans — never attach these.
const SKIP = [/bell-schedule/i, /school-district/i, /pacing-guide/i];

// Manual overrides, filled in after reviewing a dry run:
//   "some-file-name.md": "Exact Record Title"   → force this match
//   "some-file-name.md": null                    → skip this file
// These 8 are correct but scored just under threshold (MA / A&P abbreviations).
const OVERRIDES = {
  "anatomy-physiology-essentials-body-organization-lesson-plan-pdf.md": "IPC — A&P Essentials: Body Organization",
  "anatomy-physiology-essentials-body-systems-lesson-plan-pdf.md": "IPC — A&P Essentials: Body Systems",
  "ianatomy-physiology-capstone-lesson-plan-pdf.md": "IPC — Anatomy & Physiology Capstone",
  "lesson-plan-anatomy-physiology-essentials-diseases-disorders-pdf.md": "IPC — A&P Essentials: Diseases & Disorders",
  "lesson-plan-medical-assistant-skills-cardiac-monitoring-pdf.md": "IPC — MA Skills: Cardiac Monitoring",
  "lesson-plan-medical-assistant-skills-emergency-preparedness-pdf.md": "IPC — MA Skills: Emergency Preparedness",
  "lesson-plan-medical-assistant-skills-lab-specimens-pdf.md": "IPC — MA Skills: Lab Specimens",
  "lesson-plan-medical-assistant-skills-pulmonary-function-pdf.md": "IPC — MA Skills: Pulmonary Function",
  // Corrections found by reviewing the full record list:
  "lesson-plan-medical-assistant-skills-patient-prep-pdf.md": "IPC — MA Skills: Patient Prep",
  "skills-for-health-science-professionals-activities-of-daily-living-lesson-plan-pdf.md": "IPC — Skills for Health Science Professionals: ADLs",
  // This folder is all IPC; use the IPC record, not the LPSCS one of the same name.
  "criminal-law-history-development-lesson-plan-pdf.md": "IPC — Criminal Law History & Development",
};

const STOPWORDS = new Set([
  "lesson", "plan", "plans", "pdf", "the", "a", "an", "of", "in", "for", "and",
  "to", "on", "s", "i", "introduction", "intro",
]);

function tokens(s) {
  return new Set(
    s
      .toLowerCase()
      .replace(/\.md$/, "")
      .replace(/-?pdf$/, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w && !STOPWORDS.has(w))
  );
}

function score(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter); // Jaccard
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
  if (!fs.existsSync(FOLDER)) {
    console.error("Folder not found:", FOLDER);
    process.exit(1);
  }
  const files = fs.readdirSync(FOLDER).filter((f) => f.toLowerCase().endsWith(".md"));
  console.log(`Found ${files.length} markdown files in ${FOLDER}\n`);

  initAdmin();
  const db = getFirestore();
  const snap = await db.collection(COLLECTION).where("type", "==", TYPE).get();
  const records = snap.docs.map((d) => ({
    id: d.id,
    title: String(d.data().lessonPlan || "(untitled)"),
    tokens: tokens(String(d.data().lessonPlan || "")),
  }));
  console.log(`Loaded ${records.length} Lesson Plan records.\n`);

  if (LIST) {
    console.log("All Lesson Plan record titles (alphabetical):");
    for (const r of [...records].sort((a, b) => a.title.localeCompare(b.title))) {
      console.log(`  ${r.title}`);
    }
    return;
  }

  const matches = []; // { file, record, score }
  const unmatched = [];
  const skipped = [];
  const usedByRecord = new Map();

  for (const file of files) {
    if (SKIP.some((re) => re.test(file))) { skipped.push(file); continue; }
    if (file in OVERRIDES) {
      const target = OVERRIDES[file];
      if (target === null) { skipped.push(file); continue; }
      const rec = records.find((r) => r.title.toLowerCase() === String(target).toLowerCase());
      if (rec) {
        matches.push({ file, record: rec, score: 1 });
        usedByRecord.set(rec.id, (usedByRecord.get(rec.id) || 0) + 1);
      } else {
        unmatched.push({ file, best: null, bestScore: 0, note: `override title not found: "${target}"` });
      }
      continue; // an override is explicit — never fall back to fuzzy matching
    }
    const ft = tokens(file);
    let best = null;
    let bestScore = 0;
    for (const rec of records) {
      const sc = score(ft, rec.tokens);
      if (sc > bestScore) { bestScore = sc; best = rec; }
    }
    if (best && bestScore >= THRESHOLD) {
      matches.push({ file, record: best, score: bestScore });
      usedByRecord.set(best.id, (usedByRecord.get(best.id) || 0) + 1);
    } else {
      unmatched.push({ file, best, bestScore });
    }
  }

  console.log(`=== MATCHES (${matches.length}) ===`);
  for (const m of matches.sort((a, b) => b.score - a.score)) {
    const dupe = usedByRecord.get(m.record.id) > 1 ? "  ⚠ shared record" : "";
    console.log(`  ${m.score.toFixed(2)}  ${m.file}\n         → ${m.record.title}${dupe}`);
  }

  if (unmatched.length) {
    console.log(`\n=== NO CONFIDENT MATCH (${unmatched.length}) — review / add to OVERRIDES ===`);
    for (const u of unmatched) {
      const detail = u.note ? u.note : `best guess (${u.bestScore.toFixed(2)}): ${u.best ? u.best.title : "—"}`;
      console.log(`  ${u.file}\n         ${detail}`);
    }
  }
  if (skipped.length) {
    console.log(`\n=== SKIPPED (not lesson plans) (${skipped.length}) ===`);
    for (const s of skipped) console.log(`  ${s}`);
  }

  if (!WRITE) {
    console.log(`\nDry run — nothing written. Re-run with --write to save content to the ${matches.length} matched records.`);
    return;
  }

  const now = FieldValue.serverTimestamp();
  let written = 0;
  let batch = db.batch();
  for (const m of matches) {
    const text = fs.readFileSync(path.join(FOLDER, m.file), "utf8");
    batch.update(db.collection(COLLECTION).doc(m.record.id), { content: text, updatedAt: now });
    if (++written % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`\nWrote content to ${written} Lesson Plan records.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
