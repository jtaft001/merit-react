#!/usr/bin/env node
/**
 * Link LPSCS lesson days to their unit plans, using a curated map of v7 unit
 * day-ranges → lesson-plan titles. Every day in a range gets its plan's
 * lessonPlan relation, so "click a day → open the plan" works across the unit.
 *
 * Days with no LPSCS plan (FEMA, AHA BLS, capstone labs, finals, orientation)
 * are intentionally left unlinked.
 *
 * Dry run by default. --write applies.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/link-lpscs-units.js            # preview the unit→plan pairing
 *   node scripts/link-lpscs-units.js --write
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

const COLLECTION = "teaching";
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const WRITE = process.argv.includes("--write");

// [startDay, endDay, exact LPSCS plan title]. Days are inclusive.
const MAP = [
  // Phase 1 — Exploring Careers is one unit plan covering all pathway days.
  [2, 10, "Exploring Careers: Law / Public Safety / Corrections & Security"],
  [11, 17, "Ethical Practices in Law / Public Safety / Corrections & Security"],
  // Phase 2 — job-defined + first aid (FEMA/BLS have no iCEV plan)
  [45, 46, "A Job Defined: Emergency Dispatcher"],
  [47, 49, "A Job Defined: Emergency Medical Technician"],
  [50, 57, "First Aid Basics"],
  // Phase 3 — Criminal Law + Codes
  [73, 81, "Criminal Law History & Development"],
  [82, 84, "Fundamentals of Laws & Codes"],
  // Phase 4 — Unit 4.2 Public Safety Systems (Days 91-101, incl. jail structures)
  [91, 101, "Public Safety Systems & Agencies"],
  // Phase 5 — Law enforcement + patrol + soft-skills units
  [102, 103, "Law Enforcement Services"],
  [104, 105, "A Job Defined: Police Officer"],
  [106, 107, "A Job Defined: Chief of Police"],
  [108, 111, "Public Safety Systems & Agencies"],
  [112, 114, "Listening 101"],
  [115, 119, "Conflict Management"],
  // Phase 6 — Corrections
  [126, 127, "Correction Services"],
  [128, 138, "The Correctional System"],
  // Phase 7 — Legal services + courts
  [139, 140, "Legal Services"],
  [141, 151, "Court Systems & Structures"],
  // Phase 8 — Private security, interagency, fire
  [152, 158, "Private Security Systems & Agencies"],
  [159, 164, "Interagency Cooperation"],
  [165, 166, "Emergency & Fire Management Services"],
  // Unit 8.5 — Interviews (Prep = 171-172, Process = 173-177)
  [171, 172, "Formulas for Career Success: Interview Preparation"],
  [173, 177, "Formulas for Career Success: The Interview Process"],
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

  const lpscsIds = new Set();
  snap.docs.forEach((d) => {
    const x = d.data();
    if (x.type === "courses" && (String(x.code || "").toUpperCase() === "LPSCS" || /law.*public safety|lpscs/i.test(String(x.course || "")))) lpscsIds.add(d.id);
  });
  if (!lpscsIds.size) { console.error("No LPSCS course found. Aborting."); process.exit(1); }

  const inLpscs = (course) => Array.isArray(course) && course.some((id) => lpscsIds.has(id));

  // LPSCS plans by title (prefer a plan actually in the LPSCS course).
  const planByTitle = new Map();
  snap.docs.forEach((d) => {
    const x = d.data();
    if (x.type !== "lessonPlans") return;
    const title = String(x.lessonPlan || "");
    const key = title.toLowerCase();
    if (!planByTitle.has(key) || inLpscs(x.course)) planByTitle.set(key, { id: d.id, title, lpscs: inLpscs(x.course) });
  });

  // LPSCS lesson days by dayNumber.
  const dayByNum = new Map();
  snap.docs.forEach((d) => {
    const x = d.data();
    if (x.type === "lessonDays" && inLpscs(x.course) && typeof x.dayNumber === "number") dayByNum.set(x.dayNumber, d.ref);
  });
  console.log(`LPSCS lesson days: ${dayByNum.size}\n`);

  const updates = []; // {ref, planId}
  const missingPlans = [];
  let linked = 0;
  console.log("=== UNIT → PLAN ===");
  for (const [a, b, title] of MAP) {
    const plan = planByTitle.get(title.toLowerCase());
    if (!plan) { missingPlans.push(title); console.log(`  Days ${a}-${b} → ✗ PLAN NOT FOUND: "${title}"`); continue; }
    let n = 0;
    for (let day = a; day <= b; day++) { const ref = dayByNum.get(day); if (ref) { updates.push({ ref, planId: plan.id }); n++; } }
    linked += n;
    console.log(`  Days ${a}-${b} → ${plan.title}${plan.lpscs ? "" : "  ⚠ not an LPSCS-course plan"}  (${n} days)`);
  }

  const mappedDays = new Set(updates.map((u) => u.ref.id));
  console.log(`\nLinked days: ${linked} / ${dayByNum.size}. Unlinked: ${dayByNum.size - mappedDays.size} (FEMA/BLS/labs/finals/IPC soft-skills — no LPSCS plan).`);
  if (missingPlans.length) console.log(`Missing plans: ${missingPlans.length} — check titles.`);

  if (!WRITE) { console.log(`\nDry run — nothing written. Re-run with --write to link ${linked} days.`); return; }

  const now = FieldValue.serverTimestamp();
  let batch = db.batch(); let ops = 0;
  for (const u of updates) { batch.update(u.ref, { lessonPlan: [u.planId], updatedAt: now }); if (++ops % 400 === 0) { await batch.commit(); batch = db.batch(); } }
  await batch.commit();
  console.log(`\nLinked ${linked} LPSCS lesson days to their unit plans.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
