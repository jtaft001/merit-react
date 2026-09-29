#!/usr/bin/env node
/**
 * Import Taft's class roster into the students collection. Matches each roster
 * student to an existing record by studentNumber, then by name; updates matches
 * (fills studentNumber / grade / class), creates only true no-matches. A student
 * in two periods becomes ONE record assigned to their first-listed class.
 *
 * Reads the git-ignored scripts/data/roster.local.txt (PDF export text).
 * Dry run by default. --write applies. Student IDs are stored as an indexed
 * `studentNumber` field, never as the document ID.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/import-roster.js            # preview
 *   node scripts/import-roster.js --write     # apply
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "data", "roster.local.txt");
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "merit-ems";
const WRITE = process.argv.includes("--write");

/** "Last, First M" → { name: "First M Last", first, last }. */
function parseName(raw) {
  const s = raw.replace(/^\*/, "").trim();
  const [lastPart, firstPart = ""] = s.split(",");
  const last = lastPart.trim();
  const first = firstPart.trim();
  return { name: `${first} ${last}`.trim(), first, last };
}
/** Match key from a surname + given name: (lastWord | firstWord), lowercased. */
function nameKey(last, first) {
  const lw = last.trim().split(/\s+/).pop() || "";
  const fw = first.trim().split(/\s+/)[0] || "";
  return `${lw}|${fw}`.toLowerCase();
}
/** Key from an existing "First [Middle] Last" record name. */
function keyFromFullName(name) {
  const t = String(name || "").trim().split(/\s+/);
  if (t.length < 2) return String(name || "").toLowerCase();
  return nameKey(t[t.length - 1], t[0]);
}

function parseRoster(text) {
  const lines = text.split("\n");
  const rows = []; // { studentNumber, name, first, last, grade, period, course }
  let period = "", course = "";
  const headerRe = /^\s*(\d)\s+(.+?)\s+Y\s+\d+\s+\S+\s+Taft/i;
  const rowRe = /^\s*\d{2}\s+(\d{7})\s+(\*?[^0-9]+?)\s+(\d{1,2})\s*$/;
  for (const line of lines) {
    const h = line.match(headerRe);
    if (h) { period = h[1]; course = h[2].trim(); continue; }
    const r = line.match(rowRe);
    if (r) {
      const { name, first, last } = parseName(r[2]);
      rows.push({ studentNumber: r[1], name, first, last, grade: r[3], period, course });
    }
  }
  return rows;
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
  if (!fs.existsSync(DATA)) { console.error("Roster file not found:", DATA); process.exit(1); }
  const rows = parseRoster(fs.readFileSync(DATA, "utf8"));
  console.log(`Parsed ${rows.length} roster rows.`);

  // Dedup by studentNumber; keep first-listed class. Track multi-period.
  const byId = new Map();
  const multiPeriod = [];
  for (const r of rows) {
    if (byId.has(r.studentNumber)) {
      const first = byId.get(r.studentNumber);
      first.otherClasses.push(`P${r.period} ${r.course}`);
      if (first.otherClasses.length === 1) multiPeriod.push(first);
    } else {
      byId.set(r.studentNumber, { ...r, className: `Period ${r.period} · ${r.course}`, otherClasses: [] });
    }
  }
  const roster = [...byId.values()];
  console.log(`${roster.length} unique students (${multiPeriod.length} in more than one period).\n`);

  initAdmin();
  const db = getFirestore();
  const snap = await db.collection("students").get();
  const byNumber = new Map();
  const byNameKey = new Map();
  snap.docs.forEach((d) => {
    const x = d.data();
    if (x.studentNumber) byNumber.set(String(x.studentNumber).trim(), d);
    const k = keyFromFullName(x.name);
    if (!byNameKey.has(k)) byNameKey.set(k, []);
    byNameKey.get(k).push(d);
  });

  const matchId = [], matchName = [], neu = [], ambiguous = [];
  for (const s of roster) {
    if (byNumber.has(s.studentNumber)) { matchId.push({ s, doc: byNumber.get(s.studentNumber) }); continue; }
    const hits = byNameKey.get(nameKey(s.last, s.first)) || [];
    if (hits.length === 1) matchName.push({ s, doc: hits[0] });
    else if (hits.length > 1) ambiguous.push({ s, hits });
    else neu.push({ s });
  }

  const show = (title, list, fmt) => { console.log(`\n=== ${title} (${list.length}) ===`); list.forEach((x) => console.log("  " + fmt(x))); };
  show("MATCH BY ID → update", matchId, ({ s }) => `${s.studentNumber}  ${s.name}`);
  show("MATCH BY NAME → update (+set ID)", matchName, ({ s, doc }) => `${s.studentNumber}  ${s.name}  ≈  ${doc.data().name}`);
  show("NEW → create", neu, ({ s }) => `${s.studentNumber}  ${s.name}  (${s.className})`);
  if (ambiguous.length) show("AMBIGUOUS → skipped (multiple name matches)", ambiguous, ({ s, hits }) => `${s.name} → ${hits.map((h) => h.data().name).join(" / ")}`);
  if (multiPeriod.length) show("MULTI-PERIOD (class = first listed)", multiPeriod, (x) => `${x.name} — ${x.className}  (also ${x.otherClasses.join(", ")})`);

  if (!WRITE) {
    console.log(`\nDry run — nothing written. --write will update ${matchId.length + matchName.length} and create ${neu.length} (${ambiguous.length} ambiguous skipped).`);
    return;
  }

  const now = FieldValue.serverTimestamp();
  let batch = db.batch(); let ops = 0;
  const flush = async () => { if (ops) { await batch.commit(); batch = db.batch(); ops = 0; } };

  for (const { s, doc } of [...matchId, ...matchName]) {
    const cur = doc.data();
    const upd = { studentNumber: s.studentNumber, updatedAt: now };
    if (!cur.grade) upd.grade = s.grade;
    if (!cur.className) upd.className = s.className;
    batch.update(doc.ref, upd);
    if (++ops >= 400) await flush();
  }
  for (const { s } of neu) {
    batch.set(db.collection("students").doc(), {
      name: s.name, studentNumber: s.studentNumber, grade: s.grade,
      className: s.className, status: "Active", createdAt: now, updatedAt: now,
    });
    if (++ops >= 400) await flush();
  }
  await flush();
  console.log(`\nUpdated ${matchId.length + matchName.length}, created ${neu.length}.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
