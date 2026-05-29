/**
 * Set the `formName` alias on student docs so the Google-Form display name
 * (a nickname) resolves to the canonical student. Confirmed mappings only.
 *
 * Dry-run by default (prints what it WOULD do). Apply with:
 *   node scripts/set-form-names.js --apply
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

// canonical student `name` -> exact Google-Form name string to alias
const MAP = {
  "Ellysaundra Blair": "Elly Blair",
  "Joshua Einhaus": "Josh Einhaus",
};

const APPLY = process.argv.includes("--apply");

async function main() {
  const snap = await db.collection("students").get();
  const byName = new Map();
  snap.forEach((d) => byName.set((d.data().name || "").trim(), d));

  console.log(APPLY ? "APPLYING formName aliases:\n" : "DRY RUN (use --apply to write):\n");
  let n = 0;
  for (const [studentName, formName] of Object.entries(MAP)) {
    const doc = byName.get(studentName);
    if (!doc) {
      console.log(`  ✗ no student named "${studentName}" — skipped`);
      continue;
    }
    const current = doc.data().formName ?? null;
    console.log(`  ${doc.id}  "${studentName}"  formName: ${JSON.stringify(current)} -> ${JSON.stringify(formName)}`);
    if (APPLY) {
      await doc.ref.update({ formName });
      n++;
    }
  }
  console.log(APPLY ? `\nDone — updated ${n} doc(s).` : "\nNothing written (dry run).");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });