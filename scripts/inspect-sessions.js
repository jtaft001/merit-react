/** READ-ONLY: understand the shape/origin of existing sessions docs. */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const root = path.join(__filename, "..", "..");
const require = createRequire(path.join(root, "functions", "package.json"));
const admin = require("firebase-admin");
const serviceAccount = JSON.parse(fs.readFileSync(path.join(root, "serviceAccountKey.json"), "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// deterministic id = ends with _YYYY-MM-DD
const isDeterministic = (id) => /_\d{4}-\d{2}-\d{2}$/.test(id);

async function main() {
  const snap = await db.collection("sessions").get();
  let det = 0, rand = 0;
  const randSamples = [], detSamples = [];
  const fieldKeys = new Map();
  snap.forEach((d) => {
    const v = d.data();
    Object.keys(v).forEach((k) => fieldKeys.set(k, (fieldKeys.get(k) || 0) + 1));
    if (isDeterministic(d.id)) {
      det++;
      if (detSamples.length < 3) detSamples.push({ id: d.id, ...summarize(v) });
    } else {
      rand++;
      if (randSamples.length < 6) randSamples.push({ id: d.id, ...summarize(v) });
    }
  });

  console.log(`total sessions: ${snap.size}`);
  console.log(`  deterministic (Name_date): ${det}`);
  console.log(`  random auto-id           : ${rand}`);
  console.log(`\nfield presence across all docs:`);
  [...fieldKeys.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, c]) => console.log(`  ${k}: ${c}`));
  console.log(`\nrandom-id samples:`);
  randSamples.forEach((s) => console.log("  " + JSON.stringify(s)));
  console.log(`\ndeterministic-id samples:`);
  detSamples.forEach((s) => console.log("  " + JSON.stringify(s)));

  // Do random-id docs overlap (same studentId+dateStr) with deterministic ones?
  const detKey = new Set();
  const randByKey = new Map();
  snap.forEach((d) => {
    const v = d.data();
    const key = `${v.studentId}__${v.dateStr}`;
    if (isDeterministic(d.id)) detKey.add(key);
    else randByKey.set(key, (randByKey.get(key) || 0) + 1);
  });
  let randDup = 0, randUnique = 0;
  randByKey.forEach((_c, key) => (detKey.has(key) ? randDup++ : randUnique++));
  console.log(`\nrandom-id docs whose (studentId,dateStr) ALSO has a deterministic doc: ${randDup}`);
  console.log(`random-id (studentId,dateStr) with NO deterministic counterpart : ${randUnique}`);
}

function summarize(v) {
  return {
    studentId: v.studentId,
    dateStr: v.dateStr,
    netMs: v.netMs,
    clockOut: v.clockOut ? "yes" : (v.clockOut === null ? "null" : "missing"),
    source: v.source ?? undefined,
    hasCreatedAt: !!v.createdAt,
  };
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });