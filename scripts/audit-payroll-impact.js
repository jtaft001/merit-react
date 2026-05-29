/** READ-ONLY: compare stored payroll netHours vs recomputed from clean sessions. */
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
const { buildResolver } = require(path.join(root, "functions", "studentIdentity.js"));
const { toDateStr } = require(path.join(root, "functions", "dateUtils.js"));

async function main() {
  const resolve = await buildResolver(db);
  const periods = await db.collection("pay_periods").get();
  const periodById = new Map();
  periods.forEach((p) => {
    const v = p.data();
    periodById.set(p.id, {
      startStr: toDateStr(v.startDate?.toDate?.() ?? new Date(v.startDate)),
      endStr: toDateStr(v.endDate?.toDate?.() ?? new Date(v.endDate)),
    });
  });

  // distinct periods that have payroll docs
  const pay = await db.collection("payroll").get();
  const payByPeriod = new Map(); // periodId -> sum stored netHours
  pay.forEach((d) => {
    const v = d.data();
    const pid = v.periodId;
    if (!pid) return;
    payByPeriod.set(pid, (payByPeriod.get(pid) || 0) + (v.netHours || 0));
  });

  console.log("period            stored hrs   clean hrs    delta");
  console.log("─".repeat(58));
  for (const [pid] of [...payByPeriod.entries()].sort()) {
    const p = periodById.get(pid);
    if (!p) { console.log(`${pid}  (no pay_period doc)`); continue; }
    const sess = await db.collection("sessions")
      .where("dateStr", ">=", p.startStr).where("dateStr", "<=", p.endStr).get();
    let cleanMs = 0;
    sess.forEach((s) => { const n = s.data().netMs; if (typeof n === "number") cleanMs += n; });
    const cleanHrs = cleanMs / 3600000;
    const storedHrs = payByPeriod.get(pid);
    const delta = storedHrs - cleanHrs;
    const flag = Math.abs(delta) > 0.5 ? "  ⚠ INFLATED" : "";
    console.log(`${pid}      ${storedHrs.toFixed(2).padStart(8)}  ${cleanHrs.toFixed(2).padStart(10)}  ${delta.toFixed(2).padStart(8)}${flag}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
