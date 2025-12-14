// Seed pay_periods collection using the same schedule from the Apps Script.
// Requires ADC (gcloud auth application-default login) and quota project set.
// Usage: NODE_PATH=functions/node_modules node scripts/seed-pay-periods.js

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const require = createRequire(path.resolve(__filename, "..", "..", "functions", "package.json"));
let admin;
try {
  admin = require("firebase-admin");
} catch (err) {
  console.error("firebase-admin not found in functions/node_modules. Run `cd functions && npm install` first.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "merit-ems",
});

const db = admin.firestore();

const START = new Date("2025-08-17T12:00:00");
const END = new Date("2026-06-03T12:00:00");
const HOURLY_RATE = 15; // adjust if needed

function buildPeriods() {
  const periods = [];
  let start = new Date(START);
  while (start <= END) {
    const startCopy = new Date(start);
    const end = new Date(start);
    end.setDate(end.getDate() + 13);
    const startStr = startCopy.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const display =
      startCopy.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " - " +
      end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    periods.push({ startDate: startCopy, endDate: end, display, startStr, endStr });
    start.setDate(start.getDate() + 14);
  }
  return periods;
}

async function main() {
  const periods = buildPeriods();
  console.log(`Seeding ${periods.length} pay periods...`);

  const batch = db.batch();
  periods.forEach((p) => {
    const docRef = db.collection("pay_periods").doc(p.endStr);
    batch.set(docRef, {
      startDate: p.startDate,
      endDate: p.endDate,
      display: p.display,
      hourlyRate: HOURLY_RATE,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
