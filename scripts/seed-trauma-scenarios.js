#!/usr/bin/env node
/**
 * Seed trauma/bleeding scenarios into the Firestore `scenarios` collection.
 *
 * Usage:
 *   1) npm install firebase-admin
 *   2) Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.
 *   3) node scripts/seed-trauma-scenarios.js
 */
import admin from "firebase-admin";
import path from "path";
import fs from "fs";

function detectProjectId() {
  // Try env first
  const envProject =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_CONFIG;
  if (envProject) {
    try {
      // FIREBASE_CONFIG can be JSON
      const parsed =
        envProject.startsWith("{") ? JSON.parse(envProject).projectId : envProject;
      if (parsed) return parsed;
    } catch {
      // ignore parse errors
    }
  }
  // Fallback to known project
  return "merit-ems";
}

function initAdmin() {
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = detectProjectId();

  // Use explicit service account if provided
  if (credPath) {
    const resolvedCredPath = path.resolve(credPath);
    if (!fs.existsSync(resolvedCredPath)) {
      console.error("Credential file not found:", resolvedCredPath);
      process.exit(1);
    }
    admin.initializeApp({
      credential: admin.credential.cert(resolvedCredPath),
      projectId,
    });
    console.log("Initialized firebase-admin with service account:", resolvedCredPath);
    return;
  }

  // Otherwise fall back to ADC (gcloud auth application-default login)
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
  console.log(
    "Initialized firebase-admin with Application Default Credentials (ADC). Project:",
    projectId
  );
}

initAdmin();

const db = admin.firestore();

const traumaScenarios = [
  {
    id: "power-tool-laceration",
    title: "Power Tool Laceration",
    description: "Escalate bleeding control when direct pressure fails.",
    type: "Trauma",
    scenarioKey: "power-tool-laceration",
    category: "trauma",
  },
  {
    id: "arterial-thigh-bleed",
    title: "Arterial Thigh Bleed",
    description: "Spurting arterial hemorrhage needs immediate tourniquet.",
    type: "Trauma",
    scenarioKey: "arterial-thigh-bleed",
    category: "trauma",
  },
  {
    id: "venous-leg-glass",
    title: "Venous Leg Laceration",
    description: "Control steady venous bleeding with pressure bandage.",
    type: "Trauma",
    scenarioKey: "venous-leg-glass",
    category: "trauma",
  },
  {
    id: "capillary-knee-abrasion",
    title: "Capillary Knee Abrasion",
    description: "Minor oozing with contamination risk.",
    type: "Trauma",
    scenarioKey: "capillary-knee-abrasion",
    category: "trauma",
  },
  {
    id: "bleeding-with-fracture",
    title: "Bleeding with Fracture",
    description: "Control bleeding without worsening a deformity.",
    type: "Trauma",
    scenarioKey: "bleeding-with-fracture",
    category: "trauma",
  },
  {
    id: "tight-bandage-hand",
    title: "Bandage Too Tight",
    description: "Fix circulation after over-tight wrapping.",
    type: "Trauma",
    scenarioKey: "tight-bandage-hand",
    category: "trauma",
  },
];

async function main() {
  const batch = db.batch();
  const col = db.collection("scenarios");

  traumaScenarios.forEach((sc) => {
    const ref = col.doc(sc.id);
    batch.set(ref, {
      title: sc.title,
      description: sc.description,
      type: sc.type,
      scenarioKey: sc.scenarioKey,
      category: sc.category,
    });
  });

  await batch.commit();
  console.log(`Seeded ${traumaScenarios.length} trauma scenarios into 'scenarios'.`);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
