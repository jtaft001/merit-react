#!/usr/bin/env node
/**
 * Seed the private Teaching HQ from a Notion export.
 *
 * Imports every record from scripts/teaching-hq-data.json into the single
 * Firestore `teaching` collection (each doc carries a `type` field). Relations
 * are resolved in a second pass: the JSON stores Notion page URLs, and this
 * script maps each Notion URL to the Firestore doc id it created.
 *
 * Usage:
 *   1) npm install firebase-admin           (already a functions dep; run at repo root if needed)
 *   2) export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *      # or: gcloud auth application-default login
 *   3) node scripts/seed-teaching-hq.js            # import
 *      node scripts/seed-teaching-hq.js --wipe     # delete existing teaching docs first
 *
 * Safe to re-run: without --wipe it appends. Use --wipe for a clean reimport.
 */
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "teaching-hq-data.json");
const COLLECTION = "teaching";
const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";

// Order matters only cosmetically; relations are resolved across all types.
const IMPORT_ORDER = [
  "courses",
  "lessonPlans",
  "lessonDays",
  "deadlines",
  "tasks",
  "materials",
  "certifications",
  "emails",
  "districtCalendar",
];

// Fields that are stored as Firestore Timestamps (values are "YYYY-MM-DD").
const DATE_FIELDS = new Set([
  "date",
  "dueDate",
  "doDate",
  "neededBy",
  "targetDate",
  "runs",
  "received",
  "replyBy",
  "lastMessage",
]);

function initAdmin() {
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (credPath) {
    const resolved = path.resolve(credPath);
    if (!fs.existsSync(resolved)) {
      console.error("Credential file not found:", resolved);
      process.exit(1);
    }
    admin.initializeApp({
      credential: admin.credential.cert(resolved),
      projectId: PROJECT_ID,
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: PROJECT_ID,
    });
  }
}

function toTimestamp(ymd) {
  // Parse "YYYY-MM-DD" as local midnight so calendar dates don't shift.
  const [y, m, d] = String(ymd).split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return admin.firestore.Timestamp.fromDate(new Date(y, m - 1, d));
}

async function wipeExisting(db) {
  const snap = await db.collection(COLLECTION).get();
  if (snap.empty) return 0;
  let n = 0;
  let batch = db.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    n += 1;
    if (n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  return n;
}

async function run() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error("Data file not found:", DATA_PATH);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

  initAdmin();
  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (process.argv.includes("--wipe")) {
    const removed = await wipeExisting(db);
    console.log(`Wiped ${removed} existing teaching docs.`);
  }

  // Pass 1 — create every record, remembering Notion URL -> Firestore id.
  const idByNotionUrl = new Map();
  const relationsToApply = []; // { id, relations: { field: [notionUrl,...] } }
  let created = 0;

  for (const type of IMPORT_ORDER) {
    const rows = data[type] || [];
    for (const row of rows) {
      const payload = { type, createdAt: now, updatedAt: now };
      for (const [k, v] of Object.entries(row.fields || {})) {
        if (v === null || v === undefined || v === "") continue;
        payload[k] = DATE_FIELDS.has(k) ? toTimestamp(v) : v;
      }
      const ref = await db.collection(COLLECTION).add(payload);
      created += 1;
      if (row.notionUrl) idByNotionUrl.set(row.notionUrl, ref.id);
      if (row.relations && Object.keys(row.relations).length > 0) {
        relationsToApply.push({ id: ref.id, relations: row.relations });
      }
    }
    console.log(`Created ${rows.length} ${type}.`);
  }

  // Pass 2 — resolve relation URLs to the ids created above.
  let linked = 0;
  let batch = db.batch();
  let ops = 0;
  for (const item of relationsToApply) {
    const update = {};
    for (const [field, urls] of Object.entries(item.relations)) {
      const ids = (urls || [])
        .map((u) => idByNotionUrl.get(u))
        .filter((x) => Boolean(x));
      if (ids.length > 0) update[field] = ids;
    }
    if (Object.keys(update).length > 0) {
      batch.update(db.collection(COLLECTION).doc(item.id), update);
      linked += 1;
      ops += 1;
      if (ops % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
  }
  await batch.commit();

  console.log(`\nDone. Created ${created} records, linked relations on ${linked}.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
