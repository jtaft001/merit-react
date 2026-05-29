/**
 * Backfill timeclock events from the Google Form responses CSV that never
 * reached Firestore (the Apps Script sync broke ~2026-03-20). Only inserts
 * rows STRICTLY AFTER the latest existing Firestore timeclock event, so it
 * cannot duplicate what's already there. Idempotent via deterministic doc IDs.
 *
 * The CSV is the "Time & Attendance Log" export with columns:
 *   Date/Time (Pacific local), Email Address, Student Name, Action
 *
 * Dry-run by default. Apply with:
 *   node scripts/backfill-timeclock.js /tmp/timeclock-responses.csv --apply
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const root = path.join(__filename, "..", "..");
const require = createRequire(path.join(root, "functions", "package.json"));
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(path.join(root, "serviceAccountKey.json"), "utf8"))) });
const db = admin.firestore();
const { tzOffsetMs } = require(path.join(root, "functions", "dateUtils.js"));

const csvPath = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!csvPath) { console.error("usage: node scripts/backfill-timeclock.js <csv> [--apply]"); process.exit(1); }

// Pacific wall-clock "M/D/YYYY H:MM:SS" -> UTC epoch ms (DST-aware via dateUtils).
function pacificToUtcMs(s) {
  const m = s.trim().match(/^(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)$/);
  if (!m) return null;
  const [, mo, d, y, h, mi, se] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, se);
  return guess - tzOffsetMs(new Date(guess));
}

const ACTION_MAP = {
  "clock in (arriving to class)": "CLOCK IN (ARRIVING TO CLASS)",
  "clock out (leaving class)": "CLOCK OUT (LEAVING CLASS)",
  "start break (bathroom break)": "START BREAK (BATHROOM BREAK)",
  "end break (bathroom break)": "END BREAK (BATHROOM BREAK)",
};

// minimal CSV parser (handles quoted fields)
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function main() {
  // latest existing event time in Firestore
  const last = await db.collection("timeclock").orderBy("timestamp", "desc").limit(1).get();
  const lastMs = last.empty ? 0 : last.docs[0].data().timestamp.toDate().getTime();
  console.log("latest existing Firestore event:", new Date(lastMs).toISOString());

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const header = rows[0];
  console.log("CSV header:", header.join(" | "), "| data rows:", rows.length - 1);

  const toInsert = [];
  let skippedBadAction = 0, skippedBadDate = 0;
  for (const r of rows.slice(1)) {
    if (r.length < 4) continue;
    const [dts, , name, action] = r;
    const ms = pacificToUtcMs(dts);
    if (ms == null) { skippedBadDate++; continue; }
    if (ms <= lastMs) continue; // already in Firestore
    const act = ACTION_MAP[(action || "").trim().toLowerCase()];
    if (!act) { skippedBadAction++; continue; }
    toInsert.push({ name: name.trim(), action: act, ms });
  }

  console.log(`\nrows to backfill (after ${new Date(lastMs).toISOString()}): ${toInsert.length}`);
  if (skippedBadAction) console.log(`  skipped unknown-action rows: ${skippedBadAction}`);
  if (skippedBadDate) console.log(`  skipped unparseable-date rows: ${skippedBadDate}`);
  if (toInsert.length) {
    console.log("  first:", new Date(toInsert[0].ms).toISOString(), toInsert[0].name, toInsert[0].action);
    console.log("  last :", new Date(toInsert.at(-1).ms).toISOString(), toInsert.at(-1).name, toInsert.at(-1).action);
  }

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Add --apply to backfill."); return; }

  const slug = (s) => s.replace(/[^a-zA-Z0-9]/g, "_");
  const actCode = (a) => a.split(" ")[0] + a.split(" ")[1][0];
  let batch = db.batch(), n = 0, written = 0;
  for (const e of toInsert) {
    const id = `bf_${e.ms}_${slug(e.name)}_${actCode(e.action)}`;
    batch.set(db.collection("timeclock").doc(id), {
      studentId: e.name,
      action: e.action,
      timestamp: admin.firestore.Timestamp.fromMillis(e.ms),
      source: "form-backfill",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    written++;
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (n % 400 !== 0) await batch.commit();
  console.log(`\nDone — wrote ${written} timeclock events (source=form-backfill).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });