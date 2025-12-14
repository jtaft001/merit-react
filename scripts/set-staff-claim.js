import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

// Load firebase-admin from the functions folder to avoid adding deps to the root.
const __filename = fileURLToPath(import.meta.url);
const require = createRequire(path.join(__filename, "..", "functions", "package.json"));
let admin;
try {
  admin = require("firebase-admin");
} catch (err) {
  console.error("firebase-admin not found in functions/node_modules. Run `cd functions && npm install` first.");
  process.exit(1);
}

// Initializes Admin SDK using Application Default Credentials (ADC).
// Ensure you've run `gcloud auth application-default login` and set a quota project
// (`gcloud auth application-default set-quota-project merit-ems`),
// or set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON.
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "merit-ems",
});

const uid = process.argv[2];

if (!uid) {
  console.error("Usage: node scripts/set-staff-claim.js <uid>");
  process.exit(1);
}

async function main() {
  await admin.auth().setCustomUserClaims(uid, { staff: true });
  const user = await admin.auth().getUser(uid);
  console.log("Updated claims for", uid, user.customClaims);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
