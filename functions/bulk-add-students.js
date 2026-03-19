#!/usr/bin/env node
/**
 * Bulk add students to Firebase Auth and Firestore.
 *
 * Usage (from the functions/ directory):
 *   GOOGLE_APPLICATION_CREDENTIALS=../serviceAccountKey.json node bulk-add-students.js
 */
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

function initAdmin() {
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = "merit-ems";

  if (credPath) {
    const resolvedCredPath = path.resolve(credPath);
    if (!fs.existsSync(resolvedCredPath)) {
      console.error("Credential file not found:", resolvedCredPath);
      process.exit(1);
    }
    admin.initializeApp({ credential: admin.credential.cert(resolvedCredPath), projectId });
    console.log("Initialized with service account:", resolvedCredPath);
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
    console.log("Initialized with Application Default Credentials. Project:", projectId);
  }
}

initAdmin();

const db = admin.firestore();

const students = [
  { grade: 12, studentId: "2212699", lastName: "Anaya",           firstName: "Molly",       email: "ma2212699@pusdk12.org" },
  { grade: 12, studentId: "2206589", lastName: "Blair",           firstName: "Ellysaundra", email: "eb2206589@pusdk12.org" },
  { grade: 11, studentId: "2208349", lastName: "Corona Barriga",  firstName: "Violet",      email: "vc2208349@pusdk12.org" },
  { grade: 11, studentId: "2208146", lastName: "Davis",           firstName: "Bryce",       email: "bd2208146@pusdk12.org" },
  { grade: 11, studentId: "2213206", lastName: "Dixon",           firstName: "Jacob",       email: "jd2213206@pusdk12.org" },
  { grade: 11, studentId: "2208505", lastName: "Einhaus",         firstName: "Joshua",      email: "je2208505@pusdk12.org" },
  { grade: 12, studentId: "2208185", lastName: "Frost",           firstName: "Olivia",      email: "of2208185@pusdk12.org" },
  { grade: 11, studentId: "2207606", lastName: "Gordon",          firstName: "Brooke",      email: "bg2207606@pusdk12.org" },
  { grade: 12, studentId: "2212698", lastName: "Herr",            firstName: "Tru",         email: "th2212698@pusdk12.org" },
  { grade: 11, studentId: "2208279", lastName: "Herrera",         firstName: "Maia",        email: "mh2208279@pusdk12.org" },
  { grade: 11, studentId: "2212992", lastName: "Knee",            firstName: "Eva",         email: "ek2212992@pusdk12.org" },
  { grade: 11, studentId: "2208459", lastName: "Mata",            firstName: "Jasmine",     email: "jm2208459@pusdk12.org" },
  { grade: 11, studentId: "2213324", lastName: "Miland",          firstName: "Alexa",       email: "am2213324@pusdk12.org" },
  { grade: 11, studentId: "2208224", lastName: "Nelson",          firstName: "Rylie",       email: "rn2208224@pusdk12.org" },
  { grade: 11, studentId: "2209444", lastName: "Ontiveros",       firstName: "Maya",        email: "mo2209444@pusdk12.org" },
  { grade: 12, studentId: "2207561", lastName: "Petersen",        firstName: "Izabella",    email: "ip2207561@pusdk12.org" },
  { grade: 11, studentId: "2208115", lastName: "Powell",          firstName: "Alyssa",      email: "ap2208115@pusdk12.org" },
  { grade: 11, studentId: "2213132", lastName: "Rice",            firstName: "Bella",       email: "br2213132@pusdk12.org" },
  { grade: 11, studentId: "2210625", lastName: "Roberts",         firstName: "Maisie",      email: "mr2210625@pusdk12.org" },
  { grade: 11, studentId: "2213043", lastName: "Wilkes",          firstName: "Tatiana",     email: "tw2213043@pusdk12.org" },
];

async function addStudent({ grade, studentId, lastName, firstName, email }) {
  const password = studentId;
  const className = `Grade ${grade}`;
  const name = `${firstName} ${lastName}`;

  try {
    const userRecord = await admin.auth().createUser({ email, password });

    await db.collection("students").doc(userRecord.uid).set({
      authUid: userRecord.uid,
      email,
      firstName,
      lastName,
      name,
      className,
      studentId,
      status: "Active",
    });

    console.log(`✓ ${name} (${email}) — UID: ${userRecord.uid}`);
    return { success: true };
  } catch (error) {
    console.error(`✗ ${name} (${email}) — ${error.message}`);
    return { success: false, name, email, error: error.message };
  }
}

async function main() {
  console.log(`\nAdding ${students.length} students...\n`);
  const results = [];
  for (const student of students) {
    results.push(await addStudent(student));
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success);

  console.log(`\n--- Done: ${succeeded}/${students.length} succeeded ---`);
  if (failed.length > 0) {
    console.log("\nFailed:");
    failed.forEach((r) => console.log(`  ${r.name} (${r.email}): ${r.error}`));
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main();
