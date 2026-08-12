#!/usr/bin/env node
/**
 * Link Intro to Patient Care (IPC) lesson days to their unit lesson plans.
 *
 * The v1.2 manual groups the 180 days into units with clean day-ranges (below).
 * For each unit this script finds the best-matching IPC lesson-plan record by
 * token overlap against the plan title, then sets the `lessonPlan` relation on
 * every day in the range — so "click a day → open the plan" works across a unit.
 *
 * Because plan titles live in Firestore (not here), matching is fuzzy and the
 * DRY RUN prints every unit → plan pairing with its score, plus unmatched units
 * and unused plans. Review that output, then re-run with --write.
 *
 * Only IPC lesson days and IPC-course plans are touched. Days with no plan
 * (orientation, reviews, finals, capstone symposium) are intentionally skipped.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/link-ipc-units.js            # preview the unit→plan pairing
 *   node scripts/link-ipc-units.js --list     # also dump every IPC plan title
 *   node scripts/link-ipc-units.js --write
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

const COLLECTION = "teaching";
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const WRITE = process.argv.includes("--write");
const LIST = process.argv.includes("--list");
const THRESHOLD = 0.5; // minimum overlap-coefficient score to accept a match

// { days:[startDay,endDay], label, needle, exact? }
//  - days are inclusive, straight from the v1.2 manual's unit list.
//  - exact: an IPC plan title known from the repo — matched verbatim (reliable).
//  - needle: fallback keywords for fuzzy matching when `exact` is absent or the
//    exact title isn't found in Firestore.
// Days with no plan (orientation D1, S1 review D81-84, finals D85-86, symposium
// D178, S2 finals D179-180) are intentionally absent.
const MAP = [
  // Phase 1
  { days: [2, 13], label: "1.2 Scientific Procedures & Safety", needle: "scientific procedures safety laboratory", exact: "IPC — Scientific Procedures & Safety" },
  { days: [14, 18], label: "1.3 Professionalism in the Sciences", needle: "professionalism sciences", exact: "IPC — Professionalism in the Sciences: Forensic Science" },
  // Phase 2
  { days: [19, 22], label: "2.1 Medical Terminology", needle: "medical terminology health science", exact: "IPC — Medical Terminology in Health Science" },
  { days: [23, 25], label: "2.2 A&P Essentials: Body Organization", needle: "a&p body organization cavities", exact: "IPC — A&P Essentials: Body Organization" },
  { days: [26, 29], label: "2.3 A&P Essentials: Core Body Systems", needle: "a&p body systems", exact: "IPC — A&P Essentials: Body Systems" },
  { days: [30, 34], label: "2.4 A&P Essentials: Diseases & Disorders", needle: "a&p diseases disorders", exact: "IPC — A&P Essentials: Diseases & Disorders" },
  { days: [35, 38], label: "2.5 Human Physiology: Cardiovascular & EKG", needle: "human physiology cardiovascular", exact: "IPC — Human Physiology: Cardiovascular System" },
  { days: [39, 43], label: "2.6 Body Mechanics Basics", needle: "body mechanics lifting movement", exact: "IPC — Body Mechanics Basics" },
  // Phase 3
  { days: [44, 48], label: "3.1 Ethical Principles in Healthcare", needle: "ethical principles healthcare", exact: "IPC — Ethical Principles in Healthcare" },
  { days: [49, 53], label: "3.2 Ethics & Accountability (HIPAA)", needle: "ethics accountability healthcare", exact: "IPC — Ethics & Accountability in Healthcare" },
  { days: [54, 57], label: "3.3 Managing Patient Interactions", needle: "managing patient interactions", exact: "IPC — Managing Patient Interactions" },
  { days: [58, 63], label: "3.4 Child Abuse & Mandated Reporting", needle: "child abuse domestic violence", exact: "IPC — Child Abuse & Domestic Violence" },
  // Phase 4
  { days: [64, 68], label: "4.1 MA Skills: Patient Intake", needle: "medical assistant patient intake", exact: "IPC — Medical Assistant Skills: Patient Intake" },
  { days: [69, 76], label: "4.2 Vital Signs Basics", needle: "vital signs", exact: "IPC — Vital Signs Basics" },
  { days: [77, 80], label: "4.3 Medical Records & Reports", needle: "medical records reports", exact: "IPC — Medical Records & Reports" },
  // Phase 5
  { days: [87, 91], label: "5.1 Infection Control", needle: "infection control", exact: "IPC — Infection Control" },
  { days: [92, 97], label: "5.2 MA Skills: Sterile Techniques", needle: "medical assistant sterile techniques", exact: "IPC — Medical Assistant Skills: Sterile Techniques" },
  { days: [98, 101], label: "5.3 Workplace Safety in Healthcare", needle: "workplace safety healthcare", exact: "IPC — Workplace Safety in Healthcare" },
  { days: [102, 105], label: "5.4 MA Skills: Emergency Preparedness", needle: "emergency preparedness crash cart triage", exact: "IPC — MA Skills: Emergency Preparedness" },
  // 5.5 First Aid (106-110) and 5.6 CPR/AED (111-112) have NO plan record yet — left unlinked. See create-ipc-plan-records.js.
  { days: [106, 110], label: "5.5 First Aid Basics", noPlan: true },
  { days: [111, 112], label: "5.6 CPR, AED & Choking", noPlan: true },
  // Phase 6
  { days: [113, 116], label: "6.1 MA Skills: Communication", needle: "medical assistant communication", exact: "IPC — Medical Assistant Skills: Communication" },
  { days: [117, 120], label: "6.2 Understanding Patient Populations", needle: "understanding patient populations", exact: "IPC — Understanding Patient Populations" },
  { days: [121, 123], label: "6.3 Special Population Considerations", needle: "special population considerations", exact: "IPC — Special Population Considerations in Healthcare" },
  { days: [124, 126], label: "6.4 The Healthcare Industry", needle: "healthcare industry culture diversity", exact: "IPC — The Healthcare Industry: Culture & Diversity" },
  // Phase 7
  { days: [127, 128], label: "7.1 Nursing Skills: Occupied Bed", needle: "nursing occupied bed", exact: "IPC — Nursing Skills: Making an Occupied Bed" },
  { days: [129, 135], label: "7.2 Skills for HSP: Activities of Daily Living", needle: "activities daily living adls", exact: "IPC — Skills for Health Science Professionals: ADLs" },
  { days: [136, 137], label: "7.3 Nursing Skills: Modified Bed Bath", needle: "nursing modified bed bath", exact: "IPC — Nursing Skills: Performing a Modified Bed Bath" },
  { days: [138, 139], label: "7.4a Nursing Skills: Mouth Care", needle: "nursing mouth care", exact: "IPC — Nursing Skills: Providing Mouth Care" },
  { days: [140, 140], label: "7.4b Nursing Skills: Denture Cleaning", needle: "nursing denture cleaning", exact: "IPC — Nursing Skills: Cleaning Upper or Lower Denture" },
  { days: [141, 142], label: "7.5a Nursing Skills: Perineal Care", needle: "nursing perineal care", exact: "IPC — Nursing Skills: Providing Perineal Care" },
  { days: [143, 144], label: "7.5b Nursing Skills: Catheter Care", needle: "nursing catheter care", exact: "IPC — Nursing Skills: Providing Catheter Care" },
  { days: [145, 146], label: "7.6 Nursing Skills: Urinary Output", needle: "nursing urinary output", exact: "IPC — Nursing Skills: Measuring & Recording Urinary Output" },
  // 7.7 Range of Motion & Assistive Devices (147-149) has NO plan record — left unlinked.
  { days: [147, 149], label: "7.7 Range of Motion & Assistive Devices", noPlan: true },
  // Phase 8
  { days: [150, 153], label: "8.1 MA Skills: Patient Prep & Draping", needle: "patient prep draping", exact: "IPC — MA Skills: Patient Prep" },
  { days: [154, 156], label: "8.2 MA Skills: Pulmonary Function", needle: "pulmonary function spirometry", exact: "IPC — MA Skills: Pulmonary Function" },
  { days: [157, 158], label: "8.3 MA Skills: Point-of-Care Testing", needle: "point of care testing", exact: "IPC — MA Skills: Point of Care Testing" },
  { days: [159, 163], label: "8.4 MA Skills: Cardiac Monitoring & EKG", needle: "cardiac monitoring ekg", exact: "IPC — MA Skills: Cardiac Monitoring" },
  { days: [164, 164], label: "8.5a Lab Specimens", needle: "lab specimens handling", exact: "IPC — MA Skills: Lab Specimens" },
  { days: [165, 167], label: "8.5b Advanced Blood Draw / Venipuncture", needle: "advanced blood draw venipuncture", exact: "IPC — MA Skills: Advanced Blood Draw Techniques" },
  // Phase 9
  { days: [168, 168], label: "9.1a Introduction to Forensic Science", needle: "introduction forensic science", exact: "IPC — Introduction to Forensic Science" },
  { days: [169, 169], label: "9.1b Forensic Psychology", needle: "forensic psychology", exact: "IPC — Forensic Psychology" },
  { days: [170, 170], label: "9.1c Forensic Mathematics & Evidence", needle: "forensic mathematics", exact: "IPC — Mathematics in Forensic Science" },
  { days: [171, 177], label: "9.2 Anatomy & Physiology Capstone", needle: "anatomy physiology capstone", exact: "IPC — Anatomy & Physiology Capstone" },
];

const STOP = new Set(["the","a","an","of","in","for","and","to","on","s","lesson","plan","ipc","skills","ma","basics","essentials","amp","unit"]);
function tokens(s) {
  return (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t && !STOP.has(t));
}
/** Inverse document frequency of each token across the candidate plan titles.
 *  Common words ("patient", "medical") get low weight; distinctive words
 *  ("perineal", "spirometry", "forensic") get high weight. */
function buildIdf(plans) {
  const df = new Map();
  for (const p of plans) for (const t of p.toks) df.set(t, (df.get(t) || 0) + 1);
  const N = plans.length || 1;
  const idf = new Map();
  for (const [t, n] of df) idf.set(t, Math.log(1 + N / n));
  return idf;
}
function weight(toks, idf) {
  let w = 0;
  for (const t of toks) w += idf.get(t) || Math.log(2); // unseen token → modest weight
  return w;
}
/**
 * Score = share of the plan title's distinctive (IDF-weighted) tokens that the
 * unit needle covers. Matching a title's rare word counts far more than matching
 * a common connector like "patient", so single common-token collisions stay low
 * while a real unit→plan pairing scores high.
 */
function score(needleSet, titleSet, idf) {
  if (!needleSet.size || !titleSet.size) return 0;
  let matched = 0;
  for (const t of titleSet) if (needleSet.has(t)) matched += idf.get(t) || 0;
  const total = weight(titleSet, idf);
  return total > 0 ? matched / total : 0;
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

async function run() {
  initAdmin();
  const db = getFirestore();
  const snap = await db.collection(COLLECTION).get();

  const ipcIds = new Set();
  snap.docs.forEach((d) => {
    const x = d.data();
    if (x.type === "courses" && (String(x.code || "").toUpperCase() === "IPC" || /patient care/i.test(String(x.course || "")))) ipcIds.add(d.id);
  });
  if (!ipcIds.size) { console.error("No IPC course found (code 'IPC' / 'Patient Care'). Aborting."); process.exit(1); }
  const inIpc = (course) => Array.isArray(course) && course.some((id) => ipcIds.has(id));

  // Candidate plans: on the IPC course, or titled "IPC …".
  const plans = [];
  snap.docs.forEach((d) => {
    const x = d.data();
    if (x.type !== "lessonPlans") return;
    const title = String(x.lessonPlan || "");
    if (!inIpc(x.course) && !/^ipc\b/i.test(title)) return;
    plans.push({ id: d.id, title, toks: new Set(tokens(title)) });
  });
  console.log(`IPC lesson plans found: ${plans.length}`);
  if (LIST) { console.log("\n=== IPC PLANS ==="); plans.map((p) => p.title).sort().forEach((t) => console.log(`  · ${t}`)); console.log(); }
  if (!plans.length) { console.error("No IPC plans to link against. Aborting."); process.exit(1); }

  // IPC lesson days by dayNumber.
  const dayByNum = new Map();
  snap.docs.forEach((d) => {
    const x = d.data();
    if (x.type === "lessonDays" && inIpc(x.course) && typeof x.dayNumber === "number") dayByNum.set(x.dayNumber, d.ref);
  });
  console.log(`IPC lesson days: ${dayByNum.size}\n`);

  const idf = buildIdf(plans);
  const planByTitle = new Map(plans.map((p) => [p.title.toLowerCase(), p]));

  const updates = [];
  const usedPlans = new Set();
  const weakUnits = [];
  let linked = 0;
  console.log("=== UNIT → PLAN  (E = exact title, ~ = fuzzy score) ===");
  const noPlanUnits = [];
  for (const unit of MAP) {
    const [a, b] = unit.days;
    // Units with no plan record are never linked (no fuzzy fallback).
    if (unit.noPlan) {
      noPlanUnits.push(unit.label);
      console.log(`  —    D${String(a).padStart(3)}-${String(b).padStart(3)}  ${unit.label.padEnd(46)} → (no plan — intentionally unlinked)`);
      continue;
    }
    // Prefer an exact known title; fall back to fuzzy needle matching.
    const exactPlan = unit.exact ? planByTitle.get(unit.exact.toLowerCase()) : null;
    let best = exactPlan, bestScore = exactPlan ? 1 : 0, exact = !!exactPlan;
    if (!exactPlan) {
      const needleSet = new Set(tokens(unit.needle));
      for (const p of plans) {
        const sc = score(needleSet, p.toks, idf);
        if (sc > bestScore) { bestScore = sc; best = p; }
      }
    }
    const accepted = exact || bestScore >= THRESHOLD;
    const mark = exact ? "E   " : accepted ? `~${bestScore.toFixed(2)}` : `✗${bestScore.toFixed(2)}`;
    const note = unit.exact && !exactPlan ? "  ⚠ exact title not found — fuzzy fallback used" : "";
    console.log(`  ${mark} D${String(a).padStart(3)}-${String(b).padStart(3)}  ${unit.label.padEnd(46)} → ${best ? best.title : "(none)"}${note}`);
    if (!accepted || !best) { weakUnits.push(unit.label); continue; }
    usedPlans.add(best.id);
    let n = 0;
    for (let day = a; day <= b; day++) { const ref = dayByNum.get(day); if (ref) { updates.push({ ref, planId: best.id }); n++; } }
    linked += n;
  }

  console.log(`\nLinked days: ${linked} / ${dayByNum.size}.`);
  if (noPlanUnits.length) {
    console.log(`\n— ${noPlanUnits.length} unit(s) have no plan record and are intentionally unlinked (create the plan, then add its \`exact\` title to MAP):`);
    noPlanUnits.forEach((u) => console.log(`    · ${u}`));
  }
  if (weakUnits.length) {
    console.log(`\n⚠ ${weakUnits.length} unit(s) below the ${THRESHOLD} fuzzy threshold — left UNLINKED (run with --list to see plan titles, then set the unit's \`exact\` title or adjust its \`needle\` in MAP):`);
    weakUnits.forEach((u) => console.log(`    · ${u}`));
  }
  const unused = plans.filter((p) => !usedPlans.has(p.id));
  if (unused.length) {
    console.log(`\nℹ ${unused.length} IPC plan(s) not matched to any unit:`);
    unused.map((p) => p.title).sort().forEach((t) => console.log(`    · ${t}`));
  }

  if (!WRITE) { console.log(`\nDry run — nothing written. Re-run with --write to link ${linked} days.`); return; }

  const now = FieldValue.serverTimestamp();
  let batch = db.batch(); let ops = 0;
  for (const u of updates) { batch.update(u.ref, { lessonPlan: [u.planId], updatedAt: now }); if (++ops % 400 === 0) { await batch.commit(); batch = db.batch(); } }
  await batch.commit();
  console.log(`\nLinked ${linked} IPC lesson days to their unit plans.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
