#!/usr/bin/env node
/**
 * Build the Wildfire Science (WILD) lesson days for Fall 2026 from
 * wildfire-science-curriculum.docx. Each multi-day lesson block is expanded
 * into individual dated rows (one per school day), skipping weekends and PUSD
 * holidays, and tagged with its curriculum Phase.
 *
 * Dry run by default (reports existing WILD lessons + prints the plan).
 * --write deletes existing WILD lesson days in the Fall 2026 range, then creates.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/build-wildfire-lessons.js            # preview
 *   node scripts/build-wildfire-lessons.js --write    # create
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

const COLLECTION = "teaching";
const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const WRITE = process.argv.includes("--write");

// Fall 2026 term bounds — the script only touches WILD lessons in this window,
// leaving a future Spring section untouched.
const TERM_START = "2026-08-12";
const TERM_END = "2026-12-18";

// PUSD non-school days that fall inside the term.
const HOLIDAYS = new Set([
  "2026-09-07", // Labor Day
  "2026-11-11", // Veterans' Day
  "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", // Thanksgiving break
]);

// Curriculum blocks: [phase, title, start, end, lessonType[], description, materials]
const P = {
  0: "Phase 0: Course Setup",
  1: "Phase 1: Introduction to Wildland Fire",
  2: "Phase 2: Physical Science of Wildland Fire",
  3: "Phase 3: The Wildland Fire Environment",
  4: "Phase 4: Fire Effects on the Environment",
  5: "Phase 5: Fire & Organisms/Communities",
  6: "Phase 6: Fire History & Succession",
  7: "Phase 7: People in Fire's Homeland",
  8: "Phase 8: Semester Wrap-Up & Finals",
};

const BLOCKS = [
  [P[0], "Course Setup: Orientation & Classroom Safety", "2026-08-12", "2026-08-12", ["Lecture / Media"], "Introduction to the course, safety poster, and laboratory rules. Safe practices with fire in the classroom.", "FireWorks Safety Poster"],
  [P[1], "H01. Introduction to Wildland Fire in the Sierra Nevada", "2026-08-13", "2026-08-14", ["Lecture / Media"], "Thoughts and feelings about fire before/after a photo presentation. Read and analyze \"What We Don't Know About Wildfire Can Hurt Us\" (Storrie Fire, 2000).", "Handout H01-1, H01-2, H01_WildlandFireObservations.pptx"],
  [P[2], "H02. The Fire Triangle: Fuel, Heat, and Oxygen", "2026-08-17", "2026-08-19", ["Skills Lab"], "Examine the Fire Triangle. Lab 1 (heat plume match observation) and Lab 2 (extinguishing burning match arrays). Safety clothing enforced.", "Handout H02-1, H02-2, safety goggles, wood matches"],
  [P[2], "H03. The Fire Triangle, Combustion, and the Carbon Cycle", "2026-08-20", "2026-08-24", ["Lecture / Media"], "Combustion chemistry, carbon sinks and sources. Read \"Sink or Source: Fire and the Forest Carbon Cycle\". Model carbon cycle: respiration vs photosynthesis.", "Handout H03-1, H03-2, chemistry props"],
  [P[2], "H04. Heat Transfer", "2026-08-25", "2026-08-26", ["Skills Lab"], "Conduction, convection, and radiation. Group skits/models of heat-transfer methods using yarn, candy, and ball props.", "Handout H04, HeatTransferImage.pptx, yarn/balls"],
  [P[2], "Unit II Review & Quiz", "2026-08-27", "2026-08-27", ["Review", "Quiz"], "Review of Units I-II (combustion, fire triangle, carbon cycle, heat transfer). Administer Unit II Quiz.", "Classroom review, Unit II Quiz papers"],
  [P[3], "H05. Fuel Properties", "2026-08-28", "2026-09-02", ["Skills Lab"], "Outdoor fuel scavenger hunt (sketching/collecting local forest fuels). Lab: burning dry conifer twigs and newspaper in aluminum pie tins.", "Handout H05-1, H05-2, scales, timers, pie tins"],
  [P[3], "H06. Pyrolysis", "2026-09-03", "2026-09-04", ["Skills Lab"], "Chemical decomposition of organic material under heat (pyrolysis candle lab and video). Combustion and pyrolysis worksheets.", "Handout H06-1, candles, matches, pyrolysis video"],
  [P[3], "H07. Fire Spread Processes", "2026-09-08", "2026-09-09", ["Lecture / Media"], "How heat transfer, fuel properties, and pyrolysis drive wildland fire spread. Analyze videos of fire spreading through fine vs coarse logs.", "Handout H07-1, H07_Presentation.pptx, video links"],
  [P[3], "H08A. Fire Environment Triangle: The Matchstick Forest Model", "2026-09-10", "2026-09-15", ["Skills Lab"], "Build physical models of forest stand density with matches. Measure flame heights, burn times, and rates of spread across densities.", "Handout H08a-1, matchstick boards, wood matches"],
  [P[3], "H08B. Landscape Matchstick Model", "2026-09-16", "2026-09-21", ["Skills Lab"], "Design model landscapes with slopes/topography. Video-record test burns to build a fire timeline; write a newspaper case-study report.", "Handout H08b-1, H08b-3, camera/phone, ashtray, trays"],
  [P[3], "H09. Ladder Fuels and Fire Spread", "2026-09-22", "2026-09-25", ["Skills Lab"], "Construct model trees (support stands, wire branches, newspaper foliage). Investigate surface fire vs crown/ladder fire spread. Storyboards.", "Handout H09-1, H09-2, support stands, newspaper strips"],
  [P[3], "H10. Fire Behavior, Fire Weather, and Climate", "2026-09-28", "2026-09-30", ["Lecture / Media"], "How weather (RH, temp, wind) affects fire behavior using Storrie Fire IC logs. Run BEHAVE spread simulations. Record a 5-min radio podcast.", "Handout H10-1/2/3, BEHAVE tables, recording app"],
  [P[3], "Unit III Review & Environment Exam", "2026-10-01", "2026-10-02", ["Review", "Unit Exam"], "Review fuel, weather, and topography (Fire Environment Triangle). Administer Unit III Exam.", "Classroom review, Unit III Exam papers"],
  [P[4], "H11. Smoke from Wildland Fire: Just Hanging Around?", "2026-10-05", "2026-10-07", ["Lecture / Media"], "PM2.5 air quality and health impacts. Demonstrate temperature inversions. Analyze Plumas County smoke and EPA AQI data.", "Handout H11-1/2, EPA AQI tables, Plumas County charts"],
  [P[4], "H12. Fire, Soil, and Water Interactions", "2026-10-08", "2026-10-12", ["Lecture / Media"], "Fire's effects on soil structure and watershed hydrology. Analyze the Storrie Fire BAER report. Present a 3-min local radio spot.", "Handout H12-1, H12-2 (BAER report), presentation guide"],
  [P[4], "Unit IV Review & Effects Quiz", "2026-10-13", "2026-10-13", ["Review", "Quiz"], "Review smoke dispersal, temperature inversions, soil burn severity, and post-fire erosion. Administer Unit IV Quiz.", "Classroom review, Unit IV Quiz papers"],
  [P[5], "H13. Tree Identification: Create a Dichotomous Key", "2026-10-14", "2026-10-16", ["Skills Lab"], "Botanical identification. Build a class dichotomous key for 12 native Sierra Nevada tree species.", "Dichotomous key guidelines, tree photos/specimens"],
  [P[5], "H14. Researching a Plant, Animal, or Fungus", "2026-10-19", "2026-10-23", ["Project Work"], "Research the fire ecology of a native species using the Fire Effects Information System (FEIS). Write a paper and give a 3-5 min presentation.", "Handout H14-1, FEIS database, computers"],
  [P[5], "H15. Forest Communities and Climate Change", "2026-10-26", "2026-10-28", ["Lecture / Media"], "Graphic model of Sierra Nevada forest communities. Read \"Trees on the Move\"; \"Walking the Line\" debate activity.", "Handout H15, \"Trees on the Move\" article, signs"],
  [P[5], "Unit V Review & Organisms Quiz", "2026-10-29", "2026-10-29", ["Review", "Quiz"], "Review forest community distribution, species fire adaptations (crown vs surface survivors), and dichotomous keys. Administer Unit V Quiz.", "Classroom review, Unit V Quiz papers"],
  [P[6], "H16. Fire History 1: Long Stories Told by Old Trees", "2026-10-30", "2026-11-04", ["Skills Lab"], "Fire scar formation. Build a living model of cambium response to fire. Analyze growth rings and pool data from 17 trees to map a stand's fire history.", "Handout H16-1/2, tree cookie specimen, tree posters"],
  [P[6], "H17. Fire History 2: History of Stand-Replacing Fire", "2026-11-05", "2026-11-09", ["Lecture / Media"], "Dendrochronology and tree cohorts in stand replacement. Determine pith dates from increment core posters. Draw a stand history timeline.", "Handout H17-1, increment core posters, SodaStraw.pptx"],
  [P[6], "H18. Fire History 3: Fire Regime across a Sierra Nevada Landscape", "2026-11-10", "2026-11-13", ["Lecture / Media"], "Mixed-severity fire regimes and landscape diversity. Draw stand-age diagrams; judge if modern forests are \"out of whack\".", "H18_MixedSeverityFireRegime.pptx, landscape maps"],
  [P[6], "Unit VI Review & History Exam", "2026-11-16", "2026-11-17", ["Review", "Unit Exam"], "Review low-severity, mixed-severity, and stand-replacing regimes, cohort establishment, and dendrochronology. Administer Unit VI Exam.", "Classroom review, Unit VI Exam papers"],
  [P[7], "H19. Sierra Nevada Forests Today", "2026-11-18", "2026-11-20", ["Guest / Field"], "Analyze George Gruell's repeat photographs (1849 vs modern). Formulate questions for a guest speaker (ranger). Present reflection paper.", "Handout H19, H19_A Photographic Interpretation.pptx, guest ranger"],
  [P[7], "Unit VII Review & Reflection", "2026-11-30", "2026-11-30", ["Review"], "Synthesize modern forest management challenges, Native American historical burning, and modern fire suppression policies.", "Classroom review and reflective discussion"],
  [P[8], "Wildfire Science Course Semester Project", "2026-12-01", "2026-12-04", ["Project Work"], "Group research project analyzing a historic Sierra Nevada wildfire (e.g., the Chips Fire): fuel loads, weather, fire behavior, post-fire recovery.", "FEIS, online fire databases, project rubric"],
  [P[8], "Semester Project Presentations", "2026-12-07", "2026-12-09", ["Project Work"], "Group presentations of the historical fire case studies. Peer evaluations.", "Presentation rubrics, peer evaluation sheets"],
  [P[8], "Semester Final Review", "2026-12-10", "2026-12-14", ["Review"], "Game-based comprehensive review of Units I-VII (physical science, fire environment, ecology, history, human management).", "Jeopardy review board, review sheets"],
  [P[8], "Semester Final Exams", "2026-12-15", "2026-12-18", ["Unit Exam"], "1st Period final examination: comprehensive written exam and laboratory safety practical. Dec 17-18 are the Ridgeview minimum-day finals.", "Final Exam papers"],
];

function eachSchoolDay(startYmd, endYmd) {
  const days = [];
  const [ys, ms, ds] = startYmd.split("-").map(Number);
  const [ye, me, de] = endYmd.split("-").map(Number);
  const cur = new Date(ys, ms - 1, ds);
  const end = new Date(ye, me - 1, de);
  while (cur <= end) {
    const dow = cur.getDay();
    const ymd = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    if (dow !== 0 && dow !== 6 && !HOLIDAYS.has(ymd)) days.push(ymd);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function ts(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Timestamp.fromDate(new Date(y, m - 1, d));
}

function initAdmin() {
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT;
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

  const courseSnap = await db.collection(COLLECTION).where("type", "==", "courses").get();
  const wildIds = courseSnap.docs
    .filter((d) => String(d.data().code || "").toUpperCase() === "WILD" || /wild|wildfire/i.test(String(d.data().course || "")))
    .map((d) => d.id);
  if (wildIds.length === 0) { console.error("No WILD course found. Aborting."); process.exit(1); }
  console.log(`WILD course id(s): ${wildIds.join(", ")}`);

  // Report existing WILD lesson days.
  const existingSnap = await db.collection(COLLECTION).where("type", "==", "lessonDays").get();
  const existingWild = existingSnap.docs.filter((d) => {
    const c = d.data().course;
    return Array.isArray(c) && c.some((id) => wildIds.includes(id));
  });
  const inFall = existingWild.filter((d) => {
    const dt = d.data().date;
    if (!dt || !dt.toDate) return false;
    const x = dt.toDate();
    const ymd = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    return ymd >= TERM_START && ymd <= TERM_END;
  });
  console.log(`Existing WILD lesson days: ${existingWild.length} total, ${inFall.length} within Fall 2026 (${TERM_START}–${TERM_END}).\n`);

  // Expand blocks into per-day rows.
  const rows = [];
  let dayNum = 0;
  for (const [phase, title, start, end, lessonType, description, materials] of BLOCKS) {
    const days = eachSchoolDay(start, end);
    days.forEach((date, i) => {
      dayNum += 1;
      const suffix = days.length > 1 ? ` (Day ${i + 1} of ${days.length})` : "";
      rows.push({
        date, dayNumber: dayNum, phase,
        lesson: `WILD D${dayNum}: ${title}${suffix}`,
        lessonType, classActivity: description, chaptersMedia: materials,
      });
    });
  }

  console.log("=== PLANNED WILD LESSON DAYS ===");
  for (const r of rows) console.log(`  ${r.date}  #${r.dayNumber}  ${r.phase.replace(/:.*/, "")}  ${r.lesson}`);
  console.log(`\nTotal: ${rows.length} school days (curriculum says 86).`);

  if (!WRITE) {
    console.log(`\nDry run — nothing written. Re-run with --write to replace the ${inFall.length} Fall WILD lessons with these ${rows.length}.`);
    return;
  }

  // Delete existing Fall WILD lessons, then create.
  let batch = db.batch();
  let ops = 0;
  for (const d of inFall) { batch.delete(d.ref); if (++ops % 400 === 0) { await batch.commit(); batch = db.batch(); } }
  await batch.commit();
  console.log(`Deleted ${inFall.length} existing Fall WILD lesson days.`);

  const now = FieldValue.serverTimestamp();
  batch = db.batch();
  ops = 0;
  for (const r of rows) {
    batch.set(db.collection(COLLECTION).doc(), {
      type: "lessonDays",
      course: wildIds.slice(0, 1),
      date: ts(r.date),
      dayNumber: r.dayNumber,
      phase: r.phase,
      lesson: r.lesson,
      lessonType: r.lessonType,
      classActivity: r.classActivity,
      chaptersMedia: r.chaptersMedia,
      scheduleType: "Regular Day",
      createdAt: now,
      updatedAt: now,
    });
    if (++ops % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`Created ${rows.length} WILD lesson days.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
