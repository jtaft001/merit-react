/**
 * One-time migration: rebuild the `sessions` collection so every session is
 * keyed by the CANONICAL students doc ID (resolving Form names / nicknames /
 * NFC doc ids). Reuses the exact deriveSession + resolver logic the deployed
 * Cloud Functions use.
 *
 * Sessions are 100% derived from `timeclock`, so this wipes and rebuilds them.
 *
 * Dry-run by default (reports what WOULD change). Apply with:
 *   node scripts/rebuild-sessions.js --apply
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const root = path.join(__filename, "..", "..");
const require = createRequire(path.join(root, "functions", "package.json"));
const admin = require("firebase-admin");
const serviceAccount = JSON.parse(
  fs.readFileSync(path.join(root, "serviceAccountKey.json"), "utf8")
);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const { deriveSession } = require(path.join(root, "functions", "processTimeclock.js"));
const { buildResolver } = require(path.join(root, "functions", "studentIdentity.js"));
const { toDateStr } = require(path.join(root, "functions", "dateUtils.js"));

const APPLY = process.argv.includes("--apply");

async function main() {
  const resolve = await buildResolver(db);

  const snap = await db.collection("timeclock").orderBy("timestamp", "asc").limit(10000).get();

  // Group by canonical studentId + dateStr
  const grouped = new Map();
  snap.docs.forEach((doc) => {
    const d = doc.data();
    const studentId = resolve(d.studentId);
    if (!studentId) return;
    const ts = d.timestamp?.toDate?.() ?? (d.timestamp ? new Date(d.timestamp) : null);
    if (!ts) return;
    const dateStr = toDateStr(ts);
    const key = `${studentId}__${dateStr}`;
    if (!grouped.has(key)) grouped.set(key, { studentId, dateStr, events: [] });
    grouped.get(key).events.push({ action: d.action || "", timestamp: ts });
  });
  grouped.forEach((g) => g.events.sort((a, b) => a.timestamp - b.timestamp));

  // Derive new sessions
  const newSessions = [];
  for (const [, g] of grouped) {
    const s = deriveSession(g.events, g.studentId, g.dateStr);
    if (s) newSessions.push(s);
  }

  // Existing sessions
  const existing = await db.collection("sessions").get();

  const docIdFor = (sid, dateStr) => `${sid.replace(/[^a-zA-Z0-9_-]/g, "_")}_${dateStr}`;
  const newIds = new Set(newSessions.map((s) => docIdFor(s.studentId, s.dateStr)));
  const oldIds = new Set(existing.docs.map((d) => d.id));
  const toDelete = [...oldIds].filter((id) => !newIds.has(id));
  const openCount = newSessions.filter((s) => s.open).length;

  console.log(`timeclock events scanned : ${snap.size}`);
  console.log(`existing sessions        : ${existing.size}`);
  console.log(`rebuilt sessions         : ${newSessions.length}  (open/no clock-out: ${openCount})`);
  console.log(`stale docs to remove     : ${toDelete.length}`);
  if (toDelete.length) console.log(`  e.g. ${toDelete.slice(0, 8).join(", ")}${toDelete.length > 8 ? " …" : ""}`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to migrate.");
    return;
  }

  // Wipe all existing sessions, then write rebuilt ones.
  console.log("\nApplying… deleting existing sessions");
  let batch = db.batch();
  let n = 0;
  for (const doc of existing.docs) {
    batch.delete(doc.ref);
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (n % 400 !== 0) await batch.commit();

  console.log("writing rebuilt sessions");
  batch = db.batch();
  n = 0;
  const now = admin.firestore.FieldValue.serverTimestamp();
  for (const s of newSessions) {
    const ref = db.collection("sessions").doc(docIdFor(s.studentId, s.dateStr));
    batch.set(ref, { ...s, updatedAt: now, createdAt: now });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (n % 400 !== 0) await batch.commit();

  console.log(`\nDone — ${existing.size} deleted, ${newSessions.length} written.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
