#!/usr/bin/env node
/**
 * Put the links from the NECI unit plans (scripts/data/neci-dispatch-links.json)
 * on the ILPS dispatch lesson days and unit plans, as the `resources` field:
 * one "[Label](url)" per line, teacher-only labels prefixed with 🔑.
 * Replaces only `resources` on NECI records. Dry run by default.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=secrets/serviceAccountKey.json node scripts/attach-neci-links.js [--write]
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WRITE = process.argv.includes("--write");
const { units } = JSON.parse(fs.readFileSync(path.join(HERE, "data", "neci-dispatch-links.json"), "utf8"));
const lines = (items) => items.map((l) => `[${l.teacherOnly ? "🔑 " : ""}${l.label.replace(/[[\]]/g, "")}](${l.url})`).join("\n");

const cred = process.env.GOOGLE_APPLICATION_CREDENTIALS;
initializeApp({ credential: cred ? cert(path.resolve(cred)) : applicationDefault(), projectId: "merit-ems" });
const db = getFirestore();
const all = (await db.collection("teaching").get()).docs;

const updates = [];
for (const [u, { unitWide, days }] of Object.entries(units)) {
  const plan = all.find((d) => d.data().type === "lessonPlans" && new RegExp(`^NECI Unit ${u}:`).test(d.data().lessonPlan || ""));
  if (!plan) { console.log(`Unit ${u}: plan record not found — skipped`); continue; }
  updates.push([plan.ref, lines(unitWide), `Unit ${u} plan: ${unitWide.length} unit-wide`]);
  days.forEach((items, i) => {
    const day = all.find((d) => { const x = d.data(); return x.type === "lessonDays" && (x.lesson || "").startsWith(`NECI U${u}:`) && new RegExp(`— Day ${i + 1} of ${days.length}$`).test(x.unitPhase || ""); });
    if (!day) { console.log(`Unit ${u} day ${i + 1}: lesson day not found — skipped`); return; }
    updates.push([day.ref, lines(items), `  Day ${day.data().dayNumber}: ${day.data().lesson.slice(0, 60)} — ${items.length} links (${items.filter((l) => l.teacherOnly).length} 🔑)`]);
  });
}
updates.forEach(([, , msg]) => console.log(msg));
if (!WRITE) { console.log(`\nDry run: ${updates.length} records would get links. Re-run with --write.`); process.exit(0); }
const batch = db.batch();
updates.forEach(([ref, text]) => batch.update(ref, { resources: text, updatedAt: FieldValue.serverTimestamp() }));
await batch.commit();
console.log(`\nWrote links to ${updates.length} records.`);
