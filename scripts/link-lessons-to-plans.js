#!/usr/bin/env node
/**
 * Link each Lesson Day to its matching Lesson Plan (sets the lessonDay's
 * `lessonPlan` relation). Matching is scoped to the SAME course and done by
 * fuzzy title overlap, so a lesson day only links to a plan from its own course.
 *
 * Dry run by default (prints proposed links + unmatched, grouped by course).
 * --write applies. --course <CODE> limits to one course (e.g. --course IPC).
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/link-lessons-to-plans.js                 # preview all
 *   node scripts/link-lessons-to-plans.js --course IPC    # preview one course
 *   node scripts/link-lessons-to-plans.js --write         # apply
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

const COLLECTION = "teaching";
const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const WRITE = process.argv.includes("--write");
const THRESHOLD = 0.34;
const courseArgIdx = process.argv.indexOf("--course");
const COURSE_FILTER = courseArgIdx >= 0 ? String(process.argv[courseArgIdx + 1] || "").toUpperCase() : null;

// filename-style overrides (lessonDay title -> exact plan title). Fill after review.
const OVERRIDES = {};

const STOP = new Set([
  "the","a","an","of","in","for","and","to","on","s","lesson","plan","day","unit",
  "part","intro","introduction","review","assessment","ipc","lpscs","emt","wild",
]);

function tokens(s) {
  return new Set(
    String(s)
      .toLowerCase()
      // strip a "CODE D12:" lesson-day prefix and a trailing "(Day 1 of 4)"
      .replace(/^[a-z]+\s+d\d+\s*:\s*/i, "")
      .replace(/\(day\s+\d+\s+of\s+\d+\)\s*$/i, "")
      // strip a "IPC — " style course prefix from plan titles
      .replace(/^[a-z]{2,6}\s*[—-]\s*/i, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w && !STOP.has(w))
  );
}
function score(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
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

  const courses = {}; // id -> {code, name}
  const plans = [];   // {id, title, course:[ids], tokens}
  const days = [];    // {id, title, course:[ids], tokens, planCurrent}
  snap.docs.forEach((d) => {
    const x = d.data();
    if (x.type === "courses") courses[d.id] = { code: String(x.code || ""), name: String(x.course || "") };
    else if (x.type === "lessonPlans") plans.push({ id: d.id, title: String(x.lessonPlan || ""), course: Array.isArray(x.course) ? x.course : [], tokens: tokens(x.lessonPlan || "") });
    else if (x.type === "lessonDays") days.push({ id: d.id, ref: d.ref, title: String(x.lesson || ""), course: Array.isArray(x.course) ? x.course : [], tokens: tokens(x.lesson || ""), planCurrent: Array.isArray(x.lessonPlan) ? x.lessonPlan : [] });
  });

  const codeOf = (ids) => (ids || []).map((id) => courses[id] && courses[id].code).filter(Boolean).join("/") || "—";

  // Group plans by course id for scoped matching.
  const plansByCourse = new Map();
  for (const p of plans) for (const cid of p.course) { if (!plansByCourse.has(cid)) plansByCourse.set(cid, []); plansByCourse.get(cid).push(p); }

  const perCourse = {}; // code -> {matched, nolan, plans, days}
  const toWrite = [];
  const unmatched = [];

  for (const day of days) {
    const code = codeOf(day.course);
    if (COURSE_FILTER && !day.course.some((id) => courses[id] && courses[id].code.toUpperCase() === COURSE_FILTER)) continue;
    perCourse[code] = perCourse[code] || { matched: 0, total: 0 };
    perCourse[code].total++;

    // Candidate plans = plans sharing a course with this day.
    const cand = [];
    for (const cid of day.course) if (plansByCourse.has(cid)) cand.push(...plansByCourse.get(cid));
    if (OVERRIDES[day.title]) {
      const hit = cand.find((p) => p.title.toLowerCase() === String(OVERRIDES[day.title]).toLowerCase());
      if (hit) { toWrite.push({ day, plan: hit, score: 1 }); perCourse[code].matched++; continue; }
    }
    let best = null, bestScore = 0;
    for (const p of cand) { const sc = score(day.tokens, p.tokens); if (sc > bestScore) { bestScore = sc; best = p; } }
    if (best && bestScore >= THRESHOLD) { toWrite.push({ day, plan: best, score: bestScore }); perCourse[code].matched++; }
    else unmatched.push({ day, code, best, bestScore });
  }

  console.log("=== PROPOSED LINKS (by course) ===");
  const byCode = {};
  for (const m of toWrite) { const c = codeOf(m.day.course); (byCode[c] = byCode[c] || []).push(m); }
  for (const c of Object.keys(byCode).sort()) {
    console.log(`\n-- ${c} --`);
    for (const m of byCode[c].sort((a,b)=>a.day.title.localeCompare(b.day.title))) {
      console.log(`  ${m.score.toFixed(2)}  ${m.day.title}\n          → ${m.plan.title}`);
    }
  }
  console.log("\n=== PER-COURSE COVERAGE ===");
  for (const c of Object.keys(perCourse).sort()) console.log(`  ${c}: ${perCourse[c].matched}/${perCourse[c].total} lesson days linked`);
  console.log(`\nUnmatched: ${unmatched.length} (no plan in the same course scored ≥ ${THRESHOLD}).`);

  if (!WRITE) { console.log(`\nDry run — nothing written. Re-run with --write to set the lessonPlan link on ${toWrite.length} lesson days.`); return; }

  const now = FieldValue.serverTimestamp();
  let batch = db.batch(); let n = 0;
  for (const m of toWrite) { batch.update(m.day.ref, { lessonPlan: [m.plan.id], updatedAt: now }); if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); } }
  await batch.commit();
  console.log(`\nLinked ${toWrite.length} lesson days to their plans.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
