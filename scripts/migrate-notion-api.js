#!/usr/bin/env node
/**
 * One-time migration: Notion → Firestore (Teaching HQ).
 *
 * Pulls every page from the 9 Teaching HQ databases via the official Notion API
 * and writes them into the single owner-scoped `teaching` Firestore collection.
 * Relations are resolved by Notion page id (exact) in a second pass. After this
 * runs successfully, Notion can be retired — the app is the source of truth.
 *
 * SETUP (one time):
 *   1) Create a Notion internal integration: https://www.notion.so/my-integrations
 *      → "New integration" → copy the "Internal Integration Secret".
 *   2) In Notion, open the "Teaching HQ — 2026–27" page → ••• → Connections →
 *      add your integration. (That shares the page AND its databases with it.)
 *   3) Firebase admin creds, same as the other seed scripts:
 *        export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   4) Provide the Notion token (do NOT hardcode it):
 *        export NOTION_TOKEN=secret_xxx
 *
 * RUN:
 *   node scripts/migrate-notion-api.js            # import (appends)
 *   node scripts/migrate-notion-api.js --wipe     # clear existing teaching docs first
 *   node scripts/migrate-notion-api.js --dry-run  # fetch + report counts, write nothing
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

const COLLECTION = "teaching";
const NOTION_VERSION = "2022-06-28";
const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const NOTION_TOKEN = process.env.NOTION_TOKEN;

// Notion database ids for each Teaching HQ database.
const DATABASE_IDS = {
  courses: "18524fbd859445dbada81cf2c22e30f8",
  lessonPlans: "e918e729ad934f64b5c3f38022225bdf",
  lessonDays: "305e6e8acb894c01a52da16fe2deee38",
  deadlines: "d5a19b153fae48c7b976b7e1dcfcaee5",
  tasks: "e2157e3ce54e40faae5cca8fb4b92180",
  materials: "8043e5149977437597d58c57736267b6",
  certifications: "807d5b74b53d4e60ab3e7b0e53d5df55",
  emails: "3b408c69301a4bbb84158661fdbd8b42",
  districtCalendar: "43fbb445b62248b795310b53a7ccddbf",
};
const IMPORT_ORDER = Object.keys(DATABASE_IDS);

// Notion property name -> Firestore field key, per database. Extraction is
// driven by each Notion property's own type, so only names + keys are needed.
// Keep in sync with src/teaching/schema.ts.
const FIELD_MAP = {
  courses: {
    Course: "course", Code: "code", Period: "period",
    "Current Unit / Phase": "currentUnit", Platform: "platform",
    "Regular Day Time": "regularDayTime", "Wednesday Time": "wednesdayTime",
    "Minutes Regular": "minutesRegular", "Minutes Wednesday": "minutesWednesday",
    "Total Days": "totalDays", "Source Document": "sourceDocument", Notes: "notes",
  },
  lessonPlans: {
    "Lesson Plan": "lessonPlan", Course: "course", Unit: "unit",
    "Plan Type": "planType", "Plan Status": "planStatus", Chapters: "chapters",
    Objectives: "objectives", "In-Class Flow": "inClassFlow",
    "Materials Needed": "materialsNeeded", "Days Covered": "daysCovered",
    "Plan In-Class Time (min)": "planInClassTime", "Pre-Class Load (min)": "preClassLoad",
    "Drive Link": "driveLink", "Revised for 2026-27": "revisedFor2627",
    Runs: "runs", Notes: "notes", "Lesson Days": "lessonDays",
  },
  lessonDays: {
    Lesson: "lesson", Date: "date", "Day #": "dayNumber", Course: "course",
    "Lesson Type": "lessonType", "Unit / Phase": "unitPhase",
    "Lesson Block": "lessonBlock", "Class Activity": "classActivity",
    "Chapters / Media": "chaptersMedia", "Pre-Class Homework": "preClassHomework",
    "Prep Status": "prepStatus", "Schedule Type": "scheduleType",
    "Duration (min)": "duration", "Copies Needed": "copiesNeeded",
    "Lab Setup Needed": "labSetupNeeded",
    "Reflection / What Actually Happened": "reflection", "Lesson Plan": "lessonPlan",
    Materials: "materials", Assessments: "assessments",
  },
  deadlines: {
    Assessment: "assessment", Type: "assessmentType", Course: "course", "Due Date": "dueDate",
    Status: "status", "Grading Status": "gradingStatus", Owner: "owner",
    "Weight / Points": "weightPoints", "Unit / Phase": "unitPhase",
    "Prep Lead Time": "prepLeadTime", Details: "details", "Lesson Day": "lessonDay",
  },
  tasks: {
    Task: "task", Status: "status", Priority: "priority", Category: "category",
    Course: "course", "Do Date": "doDate", "Due Date": "dueDate",
    "Est. Minutes": "estMinutes", Recurring: "recurring", "Blocked By": "blockedBy",
    Notes: "notes",
  },
  materials: {
    Item: "item", Category: "category", Status: "status", Course: "course",
    "For Lesson": "forLesson", "Needed By": "neededBy", "Qty Needed": "qtyNeeded",
    "Qty On Hand": "qtyOnHand", "Est. Cost": "estCost", "Source / Vendor": "sourceVendor",
    Reusable: "reusable", Notes: "notes",
  },
  certifications: {
    Requirement: "requirement", Credential: "credential", Course: "course",
    Status: "status", "Target Date": "targetDate", "Students Complete": "studentsComplete",
    "Students Total": "studentsTotal", "Verification Method": "verificationMethod",
    "Blocks What": "blocksWhat", Notes: "notes",
  },
  emails: {
    Subject: "subject", Status: "status", "Action Needed": "actionNeeded",
    "Sender Type": "senderType", "From / To": "fromTo", "Summary / Ask": "summaryAsk",
    Course: "course", Received: "received", "Reply By": "replyBy",
    "Last Message": "lastMessage", "Follow-up Count": "followUpCount",
    "Email Link": "emailLink", "Thread ID": "threadId",
    "Keep for Record": "keepForRecord", Reopened: "reopened",
  },
  districtCalendar: {
    Event: "event", Type: "eventType", Date: "date",
    "Affects Pacing For": "affectsPacingFor", "Students Present": "studentsPresent",
    "Instructional Impact": "instructionalImpact",
  },
};

const WIPE = process.argv.includes("--wipe");
const DRY = process.argv.includes("--dry-run");

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Query one Notion database, following pagination. Returns all page objects. */
async function fetchDatabase(dbId) {
  const pages = [];
  let cursor = undefined;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion query failed for ${dbId} (${res.status}): ${text}`);
    }
    const data = await res.json();
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
    await sleep(350); // stay well under Notion's ~3 req/s limit
  } while (cursor);
  return pages;
}

function tsFromNotionDate(start) {
  if (!start) return null;
  // Date-only "YYYY-MM-DD" → local midnight so calendar days don't shift.
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const [y, m, d] = start.split("-").map(Number);
    return Timestamp.fromDate(new Date(y, m - 1, d));
  }
  const d = new Date(start);
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

/** Extract a single property's value by its Notion type. Returns {value} or {relation}. */
function extractProp(prop) {
  if (!prop) return { value: undefined };
  switch (prop.type) {
    case "title":
      return { value: prop.title.map((t) => t.plain_text).join("").trim() || undefined };
    case "rich_text":
      return { value: prop.rich_text.map((t) => t.plain_text).join("").trim() || undefined };
    case "number":
      return { value: prop.number ?? undefined };
    case "select":
      return { value: prop.select?.name };
    case "status":
      return { value: prop.status?.name };
    case "multi_select":
      return { value: prop.multi_select.map((s) => s.name) };
    case "date":
      return { value: tsFromNotionDate(prop.date?.start) };
    case "checkbox":
      return { value: prop.checkbox === true };
    case "url":
      return { value: prop.url || undefined };
    case "relation":
      return { relation: prop.relation.map((r) => r.id) };
    default:
      return { value: undefined };
  }
}

async function wipeExisting(db) {
  const snap = await db.collection(COLLECTION).get();
  if (snap.empty) return 0;
  let n = 0;
  let batch = db.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  return n;
}

async function run() {
  if (!NOTION_TOKEN) {
    console.error("Missing NOTION_TOKEN. See setup instructions at the top of this file.");
    process.exit(1);
  }

  // Fetch every database first (so a Notion error aborts before any writes).
  const byType = {};
  for (const type of IMPORT_ORDER) {
    process.stdout.write(`Fetching ${type}… `);
    byType[type] = await fetchDatabase(DATABASE_IDS[type]);
    console.log(`${byType[type].length} pages.`);
  }

  if (DRY) {
    const total = Object.values(byType).reduce((a, p) => a + p.length, 0);
    console.log(`\nDry run: ${total} pages across ${IMPORT_ORDER.length} databases. Nothing written.`);
    process.exit(0);
  }

  initAdmin();
  const db = getFirestore();
  const now = FieldValue.serverTimestamp();

  if (WIPE) console.log(`Wiped ${await wipeExisting(db)} existing teaching docs.`);

  // Pass 1 — create a doc per Notion page; map notion pageId -> firestore id.
  const idByPage = new Map();
  const relationWork = []; // { firestoreId, relations: { field: [pageId,...] } }
  let created = 0;
  let batch = db.batch();
  let ops = 0;

  for (const type of IMPORT_ORDER) {
    const map = FIELD_MAP[type];
    for (const page of byType[type]) {
      const doc = { type, createdAt: now, updatedAt: now };
      const relations = {};
      for (const [notionName, key] of Object.entries(map)) {
        const out = extractProp(page.properties[notionName]);
        if (out.relation !== undefined) {
          if (out.relation.length > 0) relations[key] = out.relation;
        } else if (out.value !== undefined && out.value !== "" &&
                   !(Array.isArray(out.value) && out.value.length === 0)) {
          doc[key] = out.value;
        }
      }
      const ref = db.collection(COLLECTION).doc();
      idByPage.set(page.id, ref.id);
      batch.set(ref, doc);
      created++;
      if (Object.keys(relations).length > 0) relationWork.push({ firestoreId: ref.id, relations });
      if (++ops % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    console.log(`Prepared ${byType[type].length} ${type}.`);
  }
  await batch.commit();

  // Pass 2 — resolve relation page ids to the firestore ids created above.
  let linked = 0;
  batch = db.batch();
  ops = 0;
  for (const item of relationWork) {
    const update = {};
    for (const [field, pageIds] of Object.entries(item.relations)) {
      const ids = pageIds.map((p) => idByPage.get(p)).filter(Boolean);
      if (ids.length > 0) update[field] = ids;
    }
    if (Object.keys(update).length > 0) {
      batch.update(db.collection(COLLECTION).doc(item.firestoreId), update);
      linked++;
      if (++ops % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
  }
  await batch.commit();

  console.log(`\nDone. Created ${created} records; linked relations on ${linked}.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
