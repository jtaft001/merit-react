/**
 * READ-ONLY diagnostic: trace the timeclock -> sessions -> payroll pipeline
 * against live Firestore. Writes nothing. Run:
 *   node scripts/diagnose-timeclock.js
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const root = path.join(__filename, "..", "..");
const require = createRequire(path.join(root, "functions", "package.json"));
const admin = require("firebase-admin");

const keyPath = path.join(root, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const line = (s = "") => console.log(s);
const hr = () => line("─".repeat(70));

async function main() {
  // ── students ────────────────────────────────────────────────────────────
  const studentsSnap = await db.collection("students").get();
  const studentIds = new Set();
  let withNfc = 0, withAuthUid = 0, idEqualsAuthUid = 0;
  const sampleStudents = [];
  studentsSnap.forEach((d) => {
    studentIds.add(d.id);
    const v = d.data();
    if (v.nfcId) withNfc++;
    if (v.authUid) withAuthUid++;
    if (v.authUid && v.authUid === d.id) idEqualsAuthUid++;
    if (sampleStudents.length < 5)
      sampleStudents.push({
        id: d.id,
        name: v.name,
        email: v.email,
        nfcId: v.nfcId ?? null,
        authUid: v.authUid ?? null,
      });
  });
  hr(); line(`STUDENTS: ${studentsSnap.size} total`);
  line(`  with nfcId: ${withNfc}   with authUid: ${withAuthUid}   docId===authUid: ${idEqualsAuthUid}`);
  line(`  samples:`);
  sampleStudents.forEach((s) => line(`    ${JSON.stringify(s)}`));

  // ── timeclock ───────────────────────────────────────────────────────────
  const tcSnap = await db.collection("timeclock").orderBy("timestamp", "desc").limit(500).get();
  const bySource = {};
  const actionCounts = {};
  const tcStudentIds = new Set();
  let matchStudents = 0, orphanStudentIds = new Set();
  const sampleTc = [];
  tcSnap.forEach((d) => {
    const v = d.data();
    const src = v.source || "(none)";
    bySource[src] = (bySource[src] || 0) + 1;
    const act = v.action || "(none)";
    actionCounts[act] = (actionCounts[act] || 0) + 1;
    const sid = v.studentId || "";
    if (sid) {
      tcStudentIds.add(sid);
      if (studentIds.has(sid)) matchStudents++;
      else orphanStudentIds.add(sid);
    }
    if (sampleTc.length < 8)
      sampleTc.push({
        studentId: sid,
        action: v.action,
        source: src,
        matchesStudentDoc: studentIds.has(sid),
        ts: v.timestamp?.toDate?.()?.toISOString?.() ?? String(v.timestamp),
      });
  });
  hr(); line(`TIMECLOCK: ${tcSnap.size} most-recent events`);
  line(`  by source: ${JSON.stringify(bySource)}`);
  line(`  distinct action strings: ${JSON.stringify(actionCounts)}`);
  line(`  events whose studentId matches a students doc id: ${matchStudents}/${tcSnap.size}`);
  line(`  distinct studentIds in timeclock: ${tcStudentIds.size}  (orphans not in students: ${orphanStudentIds.size})`);
  if (orphanStudentIds.size)
    line(`  ORPHAN studentId samples: ${JSON.stringify([...orphanStudentIds].slice(0, 8))}`);
  line(`  samples:`);
  sampleTc.forEach((e) => line(`    ${JSON.stringify(e)}`));

  // ── sessions ───────────────────────────────────────────────────────────
  const sessSnap = await db.collection("sessions").orderBy("dateStr", "desc").limit(20).get();
  hr(); line(`SESSIONS: showing ${sessSnap.size} most recent`);
  sessSnap.forEach((d) => {
    const v = d.data();
    const netH = typeof v.netMs === "number" ? (v.netMs / 3600000).toFixed(2) : "null";
    line(`    ${d.id}  date=${v.dateStr} net=${netH}h breaks=${v.breakCount ?? 0} clockOut=${v.clockOut ? "yes" : "OPEN"}`);
  });

  // ── pay_periods ──────────────────────────────────────────────────────────
  const ppSnap = await db.collection("pay_periods").get();
  hr(); line(`PAY_PERIODS: ${ppSnap.size}`);
  ppSnap.forEach((d) => {
    const v = d.data();
    const s = v.startDate?.toDate?.()?.toISOString?.()?.slice(0, 10) ?? v.startDate;
    const e = v.endDate?.toDate?.()?.toISOString?.()?.slice(0, 10) ?? v.endDate;
    line(`    ${d.id}  ${s} -> ${e}  rate=${v.hourlyRate ?? "(default)"}  display=${v.display ?? ""}`);
  });

  // ── payroll ──────────────────────────────────────────────────────────────
  const paySnap = await db.collection("payroll").orderBy("periodEnd", "desc").limit(15).get();
  hr(); line(`PAYROLL: showing ${paySnap.size} most recent`);
  paySnap.forEach((d) => {
    const v = d.data();
    line(`    ${d.id}  student=${v.studentName ?? v.studentId} net=$${v.netPay ?? "?"} hrs=${v.netHours?.toFixed?.(2) ?? "?"} ded=$${v.deductions ?? 0}`);
  });

  hr(); line("Done (read-only).");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
