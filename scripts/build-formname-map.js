/**
 * READ-ONLY: propose a mapping from the Google-Form "studentId" strings
 * (which are display names) to canonical students doc IDs.
 *
 * Strategy per distinct form-name:
 *   1. exact (case-insensitive) match on students.name
 *   2. exact match on students.formName (if already set)
 *   3. last-name + first-initial match (catches nicknames: Elly -> Ellysaundra)
 *   4. unique last-name match
 *   otherwise -> UNMATCHED (needs human decision)
 *
 * Writes nothing. Prints a table + a JSON block you can hand back to confirm.
 * Run: node scripts/build-formname-map.js
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

const norm = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();
const lastName = (s) => norm(s).split(" ").slice(-1)[0];
const firstName = (s) => norm(s).split(" ")[0];

async function main() {
  // students
  const studentsSnap = await db.collection("students").get();
  const students = studentsSnap.docs.map((d) => ({
    id: d.id,
    name: d.data().name || "",
    email: d.data().email || "",
    formName: d.data().formName || null,
  }));

  // distinct form-name studentIds from timeclock (scan a wide window)
  const tcSnap = await db
    .collection("timeclock")
    .orderBy("timestamp", "desc")
    .limit(5000)
    .get();
  const formNames = new Map(); // name -> count
  tcSnap.forEach((d) => {
    const sid = d.data().studentId || "";
    if (!sid) return;
    // skip values that are already canonical doc ids (NFC / migrated)
    if (students.some((s) => s.id === sid)) return;
    formNames.set(sid, (formNames.get(sid) || 0) + 1);
  });

  const rows = [];
  for (const [fname, count] of [...formNames.entries()].sort()) {
    let match = null;
    let how = "";

    // 1. exact name
    let cands = students.filter((s) => norm(s.name) === norm(fname));
    if (cands.length === 1) { match = cands[0]; how = "exact-name"; }

    // 2. exact existing formName
    if (!match) {
      cands = students.filter((s) => s.formName && norm(s.formName) === norm(fname));
      if (cands.length === 1) { match = cands[0]; how = "exact-formName"; }
    }

    // 3. last name + first initial (nickname tolerant)
    if (!match) {
      cands = students.filter(
        (s) => lastName(s.name) === lastName(fname) && firstName(s.name)[0] === firstName(fname)[0]
      );
      if (cands.length === 1) { match = cands[0]; how = "lastname+initial"; }
    }

    // 4. unique last name
    if (!match) {
      cands = students.filter((s) => lastName(s.name) === lastName(fname));
      if (cands.length === 1) { match = cands[0]; how = "unique-lastname"; }
    }

    rows.push({
      formName: fname,
      events: count,
      matchedDocId: match?.id ?? null,
      matchedName: match?.name ?? null,
      how: match ? how : "UNMATCHED",
    });
  }

  // print
  console.log("\nform-name → student doc mapping proposal");
  console.log("=".repeat(78));
  rows.forEach((r) => {
    const flag = r.how === "UNMATCHED" ? "  ⚠️" : r.how === "exact-name" ? "  ✓" : "  ~";
    console.log(
      `${flag} ${r.formName.padEnd(26)} (${String(r.events).padStart(4)} ev) -> ${
        r.matchedName ? r.matchedName + "  [" + r.how + "]" : "??? UNMATCHED"
      }`
    );
  });

  const unmatched = rows.filter((r) => r.how === "UNMATCHED");
  const fuzzy = rows.filter((r) => r.how !== "UNMATCHED" && r.how !== "exact-name");
  console.log("=".repeat(78));
  console.log(`total form-names: ${rows.length}`);
  console.log(`  exact: ${rows.filter((r) => r.how === "exact-name").length}`);
  console.log(`  fuzzy (verify these): ${fuzzy.length}`);
  console.log(`  UNMATCHED (need manual): ${unmatched.length}`);

  // students with NO inbound form-name (may be NFC-only or new)
  const matchedIds = new Set(rows.map((r) => r.matchedDocId).filter(Boolean));
  const unusedStudents = students.filter((s) => !matchedIds.has(s.id));
  if (unusedStudents.length) {
    console.log(`\nstudents with no matched form-name (${unusedStudents.length}):`);
    unusedStudents.forEach((s) => console.log(`    ${s.id}  ${s.name}  <${s.email}>`));
  }

  // machine-readable proposal
  const proposal = {};
  rows.forEach((r) => { if (r.matchedDocId) proposal[r.formName] = r.matchedDocId; });
  console.log("\n--- PROPOSAL JSON (docId per form-name; verify before applying) ---");
  console.log(JSON.stringify(proposal, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
