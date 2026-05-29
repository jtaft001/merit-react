/**
 * Regenerate payroll for every period that currently has payroll docs, using
 * the EXACT deployed generatePayroll logic (called with a synthetic staff
 * request). Deletes each period's existing payroll docs first so old
 * name-keyed records don't linger beside the new canonical-keyed ones.
 *
 * Dry-run by default. Apply with:
 *   node scripts/regenerate-payroll.js --apply
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

const { generatePayroll } = require(path.join(root, "functions", "generatePayroll.js"));
const { toDateStr } = require(path.join(root, "functions", "dateUtils.js"));

const APPLY = process.argv.includes("--apply");
const fakeRequest = (periodId) => ({ auth: { uid: "migration-script", token: { staff: true } }, data: { periodId } });

async function deletePayrollForPeriod(periodId) {
  const snap = await db.collection("payroll").where("periodId", "==", periodId).get();
  let batch = db.batch();
  let n = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (n % 400 !== 0) await batch.commit();
  return snap.size;
}

async function main() {
  const pay = await db.collection("payroll").get();

  // Select ENDED pay periods that have at least one session in range.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const periodsSnap = await db.collection("pay_periods").get();
  const periodIds = [];
  for (const p of periodsSnap.docs) {
    const v = p.data();
    const endDate = v.endDate?.toDate?.() ?? (v.endDate ? new Date(v.endDate) : null);
    if (!endDate) continue;
    if (endDate >= today) continue; // skip in-progress periods
    const startStr = toDateStr(v.startDate.toDate?.() ?? new Date(v.startDate));
    const endStr = toDateStr(endDate);
    const sess = await db.collection("sessions")
      .where("dateStr", ">=", startStr).where("dateStr", "<=", endStr).limit(1).get();
    if (!sess.empty) periodIds.push(p.id);
  }
  periodIds.sort();

  console.log(`${APPLY ? "REGENERATING" : "DRY RUN —"} payroll for ${periodIds.length} ended period(s) with sessions:\n`);
  console.log("period           old docs   new docs");
  console.log("─".repeat(42));

  let totalOld = 0, totalNew = 0;
  for (const pid of periodIds) {
    const oldCount = pay.docs.filter((d) => d.data().periodId === pid).length;
    totalOld += oldCount;
    if (!APPLY) {
      console.log(`${pid}      ${String(oldCount).padStart(6)}        (dry)`);
      continue;
    }
    await deletePayrollForPeriod(pid);
    const res = await generatePayroll(fakeRequest(pid));
    totalNew += res.count;
    console.log(`${pid}      ${String(oldCount).padStart(6)}     ${String(res.count).padStart(6)}`);
  }

  console.log("─".repeat(42));
  console.log(APPLY
    ? `Done — replaced ${totalOld} old docs with ${totalNew} regenerated docs.`
    : `\nDRY RUN — nothing written. Re-run with --apply.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });