#!/usr/bin/env node
/**
 * Populate the Bell Work and Exit Ticket text boxes on the LPSCS lesson days
 * from the v7 curriculum manual's daily flow.
 *
 * Reads scripts/data/lpscs-v7-flow.json (extracted from
 * "LPSCS_Curriculum_Manual_v7.0_Period2_Taft_2026-27") — one entry per school
 * day keyed by day number, each with { bellRinger, exitTicket }. Matches each
 * LPSCS lessonDays record by its `dayNumber` and writes those two fields.
 *
 * Only LPSCS lesson days are touched (EMT / IPC / Wildfire are left alone).
 * Existing values are overwritten. Dry run by default.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/populate-lpscs-flow.js            # preview
 *   node scripts/populate-lpscs-flow.js --write    # write bellRinger/exitTicket
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "data", "lpscs-v7-flow.json");
const COLLECTION = "teaching";
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const WRITE = process.argv.includes("--write");

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
  const flow = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const flowByDay = new Map(Object.values(flow).map((f) => [f.day, f]));
  console.log(`Loaded daily flow for ${flowByDay.size} days from ${path.basename(DATA)}.`);

  initAdmin();
  const db = getFirestore();

  const courseSnap = await db.collection(COLLECTION).where("type", "==", "courses").get();
  const lpscsIds = courseSnap.docs
    .filter((d) => String(d.data().code || "").toUpperCase() === "LPSCS" || /lpscs|law.*public safety/i.test(String(d.data().course || "")))
    .map((d) => d.id);
  if (!lpscsIds.length) { console.error("No LPSCS course found. Aborting."); process.exit(1); }
  console.log(`LPSCS course id(s): ${lpscsIds.join(", ")}`);

  const lessonSnap = await db.collection(COLLECTION).where("type", "==", "lessonDays").get();
  const lessons = lessonSnap.docs.filter((d) => {
    const c = d.data().course;
    return Array.isArray(c) && c.some((id) => lpscsIds.includes(id));
  });
  console.log(`Found ${lessons.length} LPSCS lesson days.\n`);

  let matched = 0, missingDay = 0, noFlow = 0, bellSet = 0, exitSet = 0;
  const updates = [];
  for (const doc of lessons) {
    const day = doc.data().dayNumber;
    if (day == null) { missingDay++; continue; }
    const f = flowByDay.get(day);
    if (!f) { noFlow++; continue; }
    matched++;
    if (f.bellRinger) bellSet++;
    if (f.exitTicket) exitSet++;
    updates.push({ ref: doc.ref, day, bellRinger: f.bellRinger || "", exitTicket: f.exitTicket || "" });
  }

  updates.sort((a, b) => a.day - b.day);
  for (const u of updates) {
    console.log(`  #${String(u.day).padStart(3)}  bell:${u.bellRinger ? "✓" : "·"} exit:${u.exitTicket ? "✓" : "·"}  ${u.bellRinger.slice(0, 60)}`);
  }
  console.log(`\nMatched ${matched} lesson days · bell set on ${bellSet} · exit set on ${exitSet}.`);
  if (missingDay) console.warn(`! ${missingDay} lesson day(s) have no dayNumber — skipped.`);
  if (noFlow) console.warn(`! ${noFlow} lesson day(s) had no matching flow entry — skipped.`);

  if (!WRITE) {
    console.log(`\nDry run — nothing written. Re-run with --write to update ${updates.length} lesson days.`);
    return;
  }

  const now = FieldValue.serverTimestamp();
  let batch = db.batch(), ops = 0;
  for (const u of updates) {
    batch.update(u.ref, { bellRinger: u.bellRinger, exitTicket: u.exitTicket, updatedAt: now });
    if (++ops % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`\nUpdated ${updates.length} LPSCS lesson days with Bell Work + Exit Ticket.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
