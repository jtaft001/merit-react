#!/usr/bin/env node
/**
 * Seed the private Teaching HQ from Notion CSV exports.
 *
 * In Notion: open "Teaching HQ", and for EACH database use ••• → Export →
 * "Markdown & CSV" (include everything). Unzip and drop the .csv files into
 *   scripts/teaching-csv/
 * Filenames keep Notion's database name (e.g. "Lesson Days abc123.csv"); this
 * script matches them by name, so you don't need to rename anything.
 *
 * Then run:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/seed-teaching-hq.js            # import (appends)
 *   node scripts/seed-teaching-hq.js --wipe     # delete existing teaching docs first
 *
 * Relations in Notion CSVs are exported as the related page's TITLE (not an id),
 * so this script resolves them by title in a second pass. Titles are matched
 * case-insensitively; if two records in a database share a title, the relation
 * links all of them.
 */
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_DIR = path.join(__dirname, "teaching-csv");
const COLLECTION = "teaching";
const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";

// Minimal mirror of src/teaching/schema.ts (this is plain Node; it can't import
// the TS module). Keep in sync if the schema's field keys/types change.
// Each field: [notionHeader, fieldKey, type]. type ∈ text|number|money|date|
// checkbox|select|multiselect|relation. relation adds a 4th entry: target type.
const SCHEMA = {
  courses: {
    match: "courses",
    title: "course",
    fields: [
      ["Course", "course", "text"],
      ["Code", "code", "select"],
      ["Period", "period", "select"],
      ["Current Unit / Phase", "currentUnit", "text"],
      ["Platform", "platform", "multiselect"],
      ["Regular Day Time", "regularDayTime", "text"],
      ["Wednesday Time", "wednesdayTime", "text"],
      ["Minutes Regular", "minutesRegular", "number"],
      ["Minutes Wednesday", "minutesWednesday", "number"],
      ["Total Days", "totalDays", "number"],
      ["Source Document", "sourceDocument", "text"],
      ["Notes", "notes", "text"],
    ],
  },
  lessonPlans: {
    match: "lesson plans",
    title: "lessonPlan",
    fields: [
      ["Lesson Plan", "lessonPlan", "text"],
      ["Course", "course", "relation", "courses"],
      ["Unit", "unit", "text"],
      ["Plan Type", "planType", "select"],
      ["Plan Status", "planStatus", "select"],
      ["Chapters", "chapters", "text"],
      ["Objectives", "objectives", "text"],
      ["In-Class Flow", "inClassFlow", "text"],
      ["Materials Needed", "materialsNeeded", "text"],
      ["Days Covered", "daysCovered", "number"],
      ["Plan In-Class Time (min)", "planInClassTime", "number"],
      ["Pre-Class Load (min)", "preClassLoad", "number"],
      ["Drive Link", "driveLink", "text"],
      ["Revised for 2026-27", "revisedFor2627", "checkbox"],
      ["Runs", "runs", "date"],
      ["Notes", "notes", "text"],
      ["Lesson Days", "lessonDays", "relation", "lessonDays"],
    ],
  },
  lessonDays: {
    match: "lesson days",
    title: "lesson",
    fields: [
      ["Lesson", "lesson", "text"],
      ["Date", "date", "date"],
      ["Day #", "dayNumber", "number"],
      ["Course", "course", "relation", "courses"],
      ["Lesson Type", "lessonType", "multiselect"],
      ["Unit / Phase", "unitPhase", "text"],
      ["Lesson Block", "lessonBlock", "text"],
      ["Class Activity", "classActivity", "text"],
      ["Chapters / Media", "chaptersMedia", "text"],
      ["Pre-Class Homework", "preClassHomework", "text"],
      ["Prep Status", "prepStatus", "select"],
      ["Schedule Type", "scheduleType", "select"],
      ["Duration (min)", "duration", "number"],
      ["Copies Needed", "copiesNeeded", "checkbox"],
      ["Lab Setup Needed", "labSetupNeeded", "checkbox"],
      ["Reflection / What Actually Happened", "reflection", "text"],
      ["Lesson Plan", "lessonPlan", "relation", "lessonPlans"],
      ["Materials", "materials", "relation", "materials"],
      ["Assessments", "assessments", "relation", "deadlines"],
    ],
  },
  deadlines: {
    match: "deadlines",
    title: "assessment",
    fields: [
      ["Assessment", "assessment", "text"],
      ["Type", "type", "select"],
      ["Course", "course", "relation", "courses"],
      ["Due Date", "dueDate", "date"],
      ["Status", "status", "select"],
      ["Grading Status", "gradingStatus", "select"],
      ["Owner", "owner", "select"],
      ["Weight / Points", "weightPoints", "number"],
      ["Unit / Phase", "unitPhase", "text"],
      ["Prep Lead Time", "prepLeadTime", "select"],
      ["Details", "details", "text"],
      ["Lesson Day", "lessonDay", "relation", "lessonDays"],
    ],
  },
  tasks: {
    match: "tasks",
    title: "task",
    fields: [
      ["Task", "task", "text"],
      ["Status", "status", "select"],
      ["Priority", "priority", "select"],
      ["Category", "category", "select"],
      ["Course", "course", "relation", "courses"],
      ["Do Date", "doDate", "date"],
      ["Due Date", "dueDate", "date"],
      ["Est. Minutes", "estMinutes", "number"],
      ["Recurring", "recurring", "select"],
      ["Blocked By", "blockedBy", "text"],
      ["Notes", "notes", "text"],
    ],
  },
  materials: {
    match: "materials",
    title: "item",
    fields: [
      ["Item", "item", "text"],
      ["Category", "category", "select"],
      ["Status", "status", "select"],
      ["Course", "course", "relation", "courses"],
      ["For Lesson", "forLesson", "relation", "lessonDays"],
      ["Needed By", "neededBy", "date"],
      ["Qty Needed", "qtyNeeded", "number"],
      ["Qty On Hand", "qtyOnHand", "number"],
      ["Est. Cost", "estCost", "money"],
      ["Source / Vendor", "sourceVendor", "text"],
      ["Reusable", "reusable", "checkbox"],
      ["Notes", "notes", "text"],
    ],
  },
  certifications: {
    match: "certifications",
    title: "requirement",
    fields: [
      ["Requirement", "requirement", "text"],
      ["Credential", "credential", "select"],
      ["Course", "course", "relation", "courses"],
      ["Status", "status", "select"],
      ["Target Date", "targetDate", "date"],
      ["Students Complete", "studentsComplete", "number"],
      ["Students Total", "studentsTotal", "number"],
      ["Verification Method", "verificationMethod", "select"],
      ["Blocks What", "blocksWhat", "text"],
      ["Notes", "notes", "text"],
    ],
  },
  emails: {
    match: "email tracker",
    title: "subject",
    fields: [
      ["Subject", "subject", "text"],
      ["Status", "status", "select"],
      ["Action Needed", "actionNeeded", "select"],
      ["Sender Type", "senderType", "select"],
      ["From / To", "fromTo", "text"],
      ["Summary / Ask", "summaryAsk", "text"],
      ["Course", "course", "relation", "courses"],
      ["Received", "received", "date"],
      ["Reply By", "replyBy", "date"],
      ["Last Message", "lastMessage", "date"],
      ["Follow-up Count", "followUpCount", "number"],
      ["Email Link", "emailLink", "text"],
      ["Thread ID", "threadId", "text"],
      ["Keep for Record", "keepForRecord", "checkbox"],
      ["Reopened", "reopened", "checkbox"],
    ],
  },
  districtCalendar: {
    match: "district calendar",
    title: "event",
    fields: [
      ["Event", "event", "text"],
      ["Type", "type", "select"],
      ["Date", "date", "date"],
      ["Affects Pacing For", "affectsPacingFor", "multiselect"],
      ["Students Present", "studentsPresent", "checkbox"],
      ["Instructional Impact", "instructionalImpact", "text"],
    ],
  },
};

const IMPORT_ORDER = Object.keys(SCHEMA);

// --- CSV parsing (RFC 4180: quotes, embedded commas and newlines) ----------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  // Strip a leading UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignore; handled by \n
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Flush the final field/row if the file doesn't end in a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// --- value coercion --------------------------------------------------------
function toNumber(raw) {
  const n = Number(String(raw).replace(/[$,]/g, "").trim());
  return Number.isNaN(n) ? null : n;
}

function toTimestamp(raw) {
  // Notion CSV dates look like "2026-08-01", "August 1, 2026", or a range
  // "2026-08-01 → 2026-08-05". Take the start and parse it.
  let s = String(raw).split(/→|—|-\s*>/)[0].trim();
  if (!s) return null;
  let d;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  } else {
    d = new Date(s);
  }
  return Number.isNaN(d.getTime()) ? null : admin.firestore.Timestamp.fromDate(d);
}

function toBool(raw) {
  return /^(yes|true|checked|✓|x)$/i.test(String(raw).trim());
}

function splitMulti(raw) {
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// --- file discovery --------------------------------------------------------
function findCsvFor(matchKeyword, files) {
  const candidates = files.filter((f) => {
    const base = path.basename(f).toLowerCase();
    return base.endsWith(".csv") && base.startsWith(matchKeyword);
  });
  if (candidates.length === 0) return null;
  // Notion sometimes emits "<name>_all.csv" with the unfiltered rows — prefer it.
  const all = candidates.find((f) => f.toLowerCase().includes("_all"));
  return all || candidates[0];
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
    admin.initializeApp({ credential: admin.credential.cert(resolved), projectId: PROJECT_ID });
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
  }
}

async function wipeExisting(db) {
  const snap = await db.collection(COLLECTION).get();
  if (snap.empty) return 0;
  let n = 0;
  let batch = db.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    n++;
    if (n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  return n;
}

/** Parse one CSV file into {fields, relations, title} rows for a given type. */
function parseTable(type, filePath) {
  const def = SCHEMA[type];
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  // Map each schema field to its column index by Notion header name.
  const colOf = {};
  for (const f of def.fields) colOf[f[0]] = header.indexOf(f[0]);

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0].trim() === "") continue; // blank line
    const fields = {};
    const relations = {};
    for (const f of def.fields) {
      const [notionName, key, ftype, target] = f;
      const idx = colOf[notionName];
      if (idx === -1 || idx === undefined) continue;
      const raw = (cells[idx] ?? "").trim();
      if (raw === "") continue;
      switch (ftype) {
        case "number":
        case "money": {
          const n = toNumber(raw);
          if (n !== null) fields[key] = n;
          break;
        }
        case "date": {
          const t = toTimestamp(raw);
          if (t) fields[key] = t;
          break;
        }
        case "checkbox":
          fields[key] = toBool(raw);
          break;
        case "multiselect":
          fields[key] = splitMulti(raw);
          break;
        case "relation":
          relations[key] = { target, titles: splitMulti(raw) };
          break;
        default:
          fields[key] = raw;
      }
    }
    out.push({ title: fields[def.title], fields, relations });
  }
  return out;
}

async function run() {
  if (!fs.existsSync(CSV_DIR)) {
    console.error(`CSV folder not found: ${CSV_DIR}\nCreate it and drop your Notion CSV exports there.`);
    process.exit(1);
  }
  const files = fs.readdirSync(CSV_DIR).map((f) => path.join(CSV_DIR, f));

  // Parse every table we can find.
  const parsed = {}; // type -> rows
  for (const type of IMPORT_ORDER) {
    const file = findCsvFor(SCHEMA[type].match, files);
    if (!file) {
      console.warn(`! No CSV found for ${type} (looked for a file starting "${SCHEMA[type].match}"). Skipping.`);
      parsed[type] = [];
      continue;
    }
    parsed[type] = parseTable(type, file);
    console.log(`Parsed ${parsed[type].length} rows for ${type} from ${path.basename(file)}.`);
  }

  initAdmin();
  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (process.argv.includes("--wipe")) {
    console.log(`Wiped ${await wipeExisting(db)} existing teaching docs.`);
  }

  // Pass 1 — create docs; record title -> [ids] per type for relation lookup.
  const idsByTitle = {}; // type -> Map(lowerTitle -> [id])
  for (const type of IMPORT_ORDER) idsByTitle[type] = new Map();
  const created = []; // { id, relations }
  let total = 0;

  for (const type of IMPORT_ORDER) {
    for (const row of parsed[type]) {
      const payload = { type, createdAt: now, updatedAt: now, ...row.fields };
      const ref = await db.collection(COLLECTION).add(payload);
      total++;
      const key = String(row.title ?? "").toLowerCase().trim();
      if (key) {
        const arr = idsByTitle[type].get(key) || [];
        arr.push(ref.id);
        idsByTitle[type].set(key, arr);
      }
      if (Object.keys(row.relations).length > 0) created.push({ id: ref.id, relations: row.relations });
    }
    console.log(`Created ${parsed[type].length} ${type}.`);
  }

  // Pass 2 — resolve relation titles to ids.
  let linked = 0;
  let unresolved = 0;
  let batch = db.batch();
  let ops = 0;
  for (const item of created) {
    const update = {};
    for (const [field, rel] of Object.entries(item.relations)) {
      const map = idsByTitle[rel.target] || new Map();
      const ids = [];
      for (const title of rel.titles) {
        const hit = map.get(title.toLowerCase().trim());
        if (hit) ids.push(...hit);
        else unresolved++;
      }
      if (ids.length > 0) update[field] = ids;
    }
    if (Object.keys(update).length > 0) {
      batch.update(db.collection(COLLECTION).doc(item.id), update);
      linked++;
      if (++ops % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
  }
  await batch.commit();

  console.log(`\nDone. Created ${total} records; linked relations on ${linked}.`);
  if (unresolved > 0) console.log(`(${unresolved} relation reference(s) had no matching title — usually fine.)`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
