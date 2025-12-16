// Create a reward_purchases document.
// Usage:
//   NODE_PATH=functions/node_modules node scripts/add-reward-purchase.js <studentId> <rewardId> <rewardName> <cost> [status]
// Example:
//   NODE_PATH=functions/node_modules node scripts/add-reward-purchase.js "Olivia Frost" "snack-10" "$10 Snack" 10 approved
//
// Notes:
// - Requires ADC (gcloud auth application-default login) and quota project set.
// - Default status is "approved". Set to "pending" if you want to review later.

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

async function main() {
  const [studentId, rewardId, rewardName, costArg, statusArg] = process.argv.slice(2);
  if (!studentId || !rewardId || !rewardName || !costArg) {
    console.error("Usage: node add-reward-purchase.js <studentId> <rewardId> <rewardName> <cost> [status]");
    process.exit(1);
  }
  const cost = Number(costArg);
  if (Number.isNaN(cost)) {
    console.error("Cost must be a number.");
    process.exit(1);
  }
  const status = statusArg || "approved";

  const docRef = db.collection("reward_purchases").doc();
  await docRef.set({
    studentId,
    rewardId,
    rewardName,
    cost,
    status,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Created reward_purchases/${docRef.id} for ${studentId}: ${rewardName} ($${cost}) status=${status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
