#!/usr/bin/env node
/**
 * Insert the NECI 9-1-1 Dispatch units (scripts/data/neci-dispatch-days.json)
 * into the ILPS / LPSCS lesson sequence and shift the rest of the year later.
 *
 * - The dispatch days start at lesson day --at (default 34, Tue Sep 29 2026,
 *   the day Period 6 began Unit 7).
 * - School days keep their dates; lessons flow into them in order. Days pinned to
 *   their date (semester exam review, final exams, no-class finals days, the
 *   year-end portfolio showcase) stay put and the flow goes around them.
 * - Existing lessons keep their records (and every link to them); only their
 *   date / day # / schedule type change. Lessons pushed past the last school day
 *   are kept but unscheduled (no date) and listed so nothing is lost.
 * - Deadlines / materials linked to a moved lesson move with it when their date
 *   matched the lesson's old date.
 * - One Lesson Plan record per NECI unit; each dispatch day links to its unit.
 *
 * Dry run by default. Refuses to run twice.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/insert-neci-dispatch.js            # preview
 *   node scripts/insert-neci-dispatch.js --write    # apply
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";

const COLLECTION = "teaching";
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, "data", "neci-dispatch-days.json");
const PHASE = "NECI 9-1-1 Dispatch";
const PLAN_TYPE = "NECI / LAPSEN Unit";
// Lessons that belong to their date, not to the sequence.
export const PINNED = /semester \d+ (final exam|exam review)|no period \d+ class|portfolio showcase/i;
const lessonName = (unit, title) => `NECI U${unit}: ${title}`;

/**
 * Pure scheduler. `days` are the existing course lesson days
 * ({id, dayNumber, dateKey, scheduleType, lesson}); `units` come from the data
 * file. Returns the slot-by-slot plan plus what moves and what overflows.
 */
export function planInsert(days, units, at) {
  const slots = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].dayNumber !== i + 1) throw new Error(`Lesson days aren't numbered 1..${slots.length} (gap at ${i + 1}).`);
    if (!slots[i].dateKey) throw new Error(`Day ${i + 1} has no date.`);
  }
  if (!Number.isInteger(at) || at < 1 || at > slots.length) throw new Error(`--at must be a day number from 1 to ${slots.length}.`);
  if (slots.some((d) => /^NECI U\d+:/.test(d.lesson || ""))) throw new Error("NECI dispatch days are already in this course — refusing to insert twice.");

  const pinned = new Set(slots.filter((d) => PINNED.test(d.lesson || "")).map((d) => d.id));
  if (slots.some((d) => d.dayNumber === at && pinned.has(d.id))) throw new Error(`Day ${at} is pinned to its date; pick another --at.`);

  const fresh = units.flatMap((u, ui) => u.days.map((d, di) => ({
    kind: "new", unit: u.unit, unitIndex: ui, dayIndex: di, unitDays: u.days.length, data: d,
  })));
  const movable = slots.filter((d) => !pinned.has(d.id)).map((d) => ({ kind: "old", doc: d }));
  let cut = movable.findIndex((m) => m.doc.dayNumber >= at);
  if (cut === -1) cut = movable.length;
  const flow = [...movable.slice(0, cut), ...fresh, ...movable.slice(cut)];

  const assign = []; // [{slot, item}]
  let k = 0;
  for (const slot of slots) {
    if (pinned.has(slot.id)) assign.push({ slot, item: { kind: "old", doc: slot }, pinned: true });
    else assign.push({ slot, item: flow[k++] });
  }
  const overflow = flow.slice(k);
  if (overflow.some((x) => x.kind === "new")) throw new Error("Not enough school days left for every dispatch day — move --at earlier.");
  const moved = assign.filter((a) => a.item.kind === "old" && a.item.doc.id !== a.slot.id);
  return { slots, assign, overflow: overflow.map((x) => x.doc), moved, pinned: slots.filter((d) => pinned.has(d.id)), freshCount: fresh.length };
}

function dateKey(v) {
  if (!v) return "";
  const d = v.toDate ? v.toDate() : new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Local midnight, matching how every other lesson-day script stores dates.
function ts(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Timestamp.fromDate(new Date(y, m - 1, d));
}
const ids = (v) => (Array.isArray(v) ? v : v ? [v] : []);

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
  const WRITE = process.argv.includes("--write");
  const atArg = process.argv.indexOf("--at");
  const AT = atArg > -1 ? Number(process.argv[atArg + 1]) : 34;
  const { units } = JSON.parse(fs.readFileSync(DATA, "utf8"));

  initAdmin();
  const db = getFirestore();
  const all = (await db.collection(COLLECTION).get()).docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() }));

  const lpscs = all.filter((d) => d.data.type === "courses" &&
    (String(d.data.code || "").toUpperCase() === "LPSCS" || /law.*public safety|lpscs/i.test(String(d.data.course || ""))));
  if (lpscs.length !== 1) { console.error(`Expected one LPSCS course, found ${lpscs.length}. Aborting.`); process.exit(1); }
  const courseId = lpscs[0].id;

  const dayDocs = all.filter((d) => d.data.type === "lessonDays" && ids(d.data.course).includes(courseId));
  const days = dayDocs.map((d) => ({ id: d.id, dayNumber: d.data.dayNumber, dateKey: dateKey(d.data.date), scheduleType: d.data.scheduleType || "Regular Day", lesson: d.data.lesson || "" }));
  const p = planInsert(days, units, AT);
  const byId = new Map(dayDocs.map((d) => [d.id, d]));

  console.log(`LPSCS course ${courseId}: ${days.length} lesson days. Inserting ${p.freshCount} NECI days at Day ${AT}.\n`);
  console.log(`Pinned to their dates (${p.pinned.length}):`);
  p.pinned.forEach((d) => console.log(`  Day ${d.dayNumber} ${d.dateKey}  ${d.lesson}`));
  console.log(`\nNew schedule from Day ${AT - 1}:`);
  for (const a of p.assign.slice(Math.max(0, AT - 2))) {
    const it = a.item;
    const label = it.kind === "new"
      ? `★ ${lessonName(it.unit, it.data.title)}  (U${it.unit} ${it.dayIndex + 1}/${it.unitDays})`
      : `${it.doc.lesson}${a.pinned ? "  [pinned]" : it.doc.id !== a.slot.id ? `  (was Day ${it.doc.dayNumber})` : ""}`;
    console.log(`  Day ${String(a.slot.dayNumber).padStart(3)} ${a.slot.dateKey}  ${label}`);
  }
  console.log(`\nPushed past the last school day — kept, but unscheduled (${p.overflow.length}):`);
  p.overflow.forEach((d) => console.log(`  (was Day ${d.dayNumber}) ${d.lesson}`));

  // Linked deadlines/materials follow their lesson when they shared its date.
  const newDateOf = new Map(p.assign.filter((a) => a.item.kind === "old").map((a) => [a.item.doc.id, a.slot.dateKey]));
  const overflowIds = new Set(p.overflow.map((d) => d.id));
  const follow = [];
  for (const [type, rel, dateField] of [["deadlines", "lessonDay", "dueDate"], ["materials", "forLesson", "neededBy"]]) {
    for (const d of all.filter((x) => x.data.type === type)) {
      const lid = ids(d.data[rel])[0];
      if (!lid || !byId.has(lid)) continue;
      const oldLessonDate = dateKey(byId.get(lid).data.date);
      const own = dateKey(d.data[dateField]);
      const name = d.data.assessment || d.data.item || d.data.material || d.id;
      if (overflowIds.has(lid)) { follow.push({ d, dateField, name, to: null, note: "lesson now unscheduled — date left as is" }); continue; }
      const to = newDateOf.get(lid);
      if (!to || to === oldLessonDate) continue;
      if (own === oldLessonDate) follow.push({ d, dateField, name, to });
      else follow.push({ d, dateField, name, to: null, note: `its date ${own || "(none)"} didn't match the lesson's, left as is` });
    }
  }
  console.log(`\nLinked deadlines/materials (${follow.length}):`);
  follow.forEach((f) => console.log(`  ${f.d.data.type}: ${f.name} → ${f.to || f.note}`));

  const planTitles = units.map((u) => u.title);
  const existingPlans = new Map(all.filter((d) => d.data.type === "lessonPlans" && planTitles.includes(d.data.lessonPlan)).map((d) => [d.data.lessonPlan, d.id]));
  console.log(`\nLesson Plans: ${units.length - existingPlans.size} to create, ${existingPlans.size} already exist.`);

  if (!WRITE) { console.log("\nDry run — nothing written. Re-run with --write to apply."); return; }

  const now = FieldValue.serverTimestamp();
  const ops = [];
  const planIds = new Map(existingPlans);
  for (const u of units) {
    if (planIds.has(u.title)) continue;
    const ref = db.collection(COLLECTION).doc();
    planIds.set(u.title, ref.id);
    const targets = [...new Set(u.days.flatMap((d) => d.objectives))];
    const materials = [...new Set(u.days.flatMap((d) => d.materials))];
    ops.push([ref, {
      type: "lessonPlans", lessonPlan: u.title, course: [courseId], unit: `NECI Unit ${u.unit}`,
      planType: PLAN_TYPE, planStatus: "Not started", daysCovered: u.days.length, planInClassTime: 55 * u.days.length,
      objectives: targets.join("\n"),
      inClassFlow: u.days.map((d, i) => `Day ${i + 1}: ${d.title} — ${d.agenda.map((a) => `${a.activity} (${a.minutes})`).join("; ")}`).join("\n"),
      materialsNeeded: materials.join("\n"),
      notes: `Source: ${u.sourceFile}. Split into 55-minute days by Claude: ${u.notes}`,
      createdAt: now, updatedAt: now,
    }, "set"]);
  }
  const newDayIds = [];
  for (const a of p.assign) {
    const it = a.item, slot = a.slot;
    if (it.kind === "new") {
      const u = units[it.unitIndex], d = it.data;
      const ref = db.collection(COLLECTION).doc();
      newDayIds.push(ref.id);
      ops.push([ref, {
        type: "lessonDays", course: [courseId], date: ts(slot.dateKey), dayNumber: slot.dayNumber, scheduleType: slot.scheduleType,
        phase: PHASE, lesson: lessonName(it.unit, d.title), lessonType: d.lessonType,
        unitPhase: `${u.title} — Day ${it.dayIndex + 1} of ${u.days.length}`,
        classActivity: d.agenda.map((x) => `${x.activity} (${x.minutes} min)`).join("\n"),
        bellRinger: d.bellWork, exitTicket: d.exitTicket,
        objectives: d.objectives.join("\n"), vocabulary: d.vocab.join(", "), supplies: d.materials.join("\n"),
        preClassHomework: d.homework || "", prepStatus: "Not started",
        lessonPlan: [planIds.get(u.title)],
        createdAt: now, updatedAt: now,
      }, "set"]);
    } else if (it.doc.id !== slot.id) {
      ops.push([byId.get(it.doc.id).ref, { date: ts(slot.dateKey), dayNumber: slot.dayNumber, scheduleType: slot.scheduleType, updatedAt: now }, "update"]);
    }
  }
  p.overflow.forEach((d, i) => ops.push([byId.get(d.id).ref, {
    date: FieldValue.delete(), dayNumber: days.length + 1 + i, scheduleType: FieldValue.delete(),
    unitPhase: `Unscheduled — pushed past Day ${days.length} by the NECI dispatch insert (was Day ${d.dayNumber})`, updatedAt: now,
  }, "update"]));
  follow.filter((f) => f.to).forEach((f) => ops.push([f.d.ref, { [f.dateField]: ts(f.to), updatedAt: now }, "update"]));

  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach(([ref, data, kind]) => (kind === "set" ? batch.set(ref, data) : batch.update(ref, data)));
    await batch.commit();
  }
  console.log(`\nDone: ${planIds.size - existingPlans.size} plans created, ${newDayIds.length} dispatch days added, ${p.moved.length} lessons moved, ${p.overflow.length} unscheduled, ${follow.filter((f) => f.to).length} deadlines/materials re-dated.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((e) => { console.error(e.message || e); process.exit(1); });
}
