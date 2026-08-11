const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");

const SETTINGS_PATH = ["settings", "hallPass"];
const DEFAULTS = {
  passesPerSemester: 5,
  pointsPerUnusedPass: 50,
  oneOutAtATime: false,
  currentSemester: "unset",
  exemptDestinations: ["nurse", "office", "counselor"],
};

async function getSettings(db) {
  const snap = await db.collection(SETTINGS_PATH[0]).doc(SETTINGS_PATH[1]).get();
  return { ...DEFAULTS, ...(snap.exists ? snap.data() : {}) };
}

function requireStaff(request) {
  if (!request.auth || request.auth.token.staff !== true) {
    throw new HttpsError("permission-denied", "Teacher sign-in required.");
  }
}

/**
 * Kiosk (public): look up a student by their school ID number. Returns the
 * name/photo for the anti-impersonation echo-back plus their pass balance and
 * whether they're currently out. Writes nothing.
 */
const hallPassLookup = async (request) => {
  const raw = (request.data && request.data.studentIdNumber) || "";
  const studentIdNumber = String(raw).trim();
  if (!studentIdNumber) throw new HttpsError("invalid-argument", "Student ID is required.");

  const db = admin.firestore();
  const snap = await db.collection("students").where("studentNumber", "==", studentIdNumber).limit(1).get();
  if (snap.empty) throw new HttpsError("not-found", "ID not found. Please see your teacher.");

  const doc = snap.docs[0];
  const s = doc.data();
  if (String(s.status || "").toLowerCase() === "dropped") {
    throw new HttpsError("not-found", "ID not found. Please see your teacher.");
  }
  const settings = await getSettings(db);

  // Currently-out = an open pass this semester.
  const open = await db.collection("passes")
    .where("studentDocId", "==", doc.id)
    .where("backAt", "==", null)
    .limit(1).get();

  return {
    studentDocId: doc.id,
    studentName: s.name || "Student",
    photoUrl: s.photoUrl || null,
    period: s.className || "",
    passesRemaining: typeof s.passesRemaining === "number" ? s.passesRemaining : settings.passesPerSemester,
    passesPerSemester: settings.passesPerSemester,
    pointsPerUnusedPass: settings.pointsPerUnusedPass,
    exemptDestinations: settings.exemptDestinations,
    currentlyOut: !open.empty,
  };
};

/**
 * Kiosk (public): check a student out. Debits a pass unless the destination is
 * exempt. Blocks at 0 passes (no self-service override). Enforces one-out-at-a-
 * time per period when enabled. Runs in a transaction so the debit and the pass
 * record are atomic.
 */
const hallPassCheckout = async (request) => {
  const { studentDocId } = request.data || {};
  const destination = String((request.data && request.data.destination) || "").trim().toLowerCase();
  if (!studentDocId || !destination) throw new HttpsError("invalid-argument", "studentDocId and destination are required.");

  const db = admin.firestore();
  const settings = await getSettings(db);
  const exempt = settings.exemptDestinations.map((x) => String(x).toLowerCase()).includes(destination);
  const studentRef = db.collection("students").doc(studentDocId);

  // One-out-at-a-time is checked before the transaction (a query can't run
  // inside a Firestore transaction alongside the doc reads we need).
  const student = (await studentRef.get()).data();
  if (!student) throw new HttpsError("not-found", "Student not found.");
  const period = student.className || "";

  const alreadyOut = await db.collection("passes")
    .where("studentDocId", "==", studentDocId).where("backAt", "==", null).limit(1).get();
  if (!alreadyOut.empty) throw new HttpsError("failed-precondition", "You're already checked out.");

  if (settings.oneOutAtATime && period) {
    const outInPeriod = await db.collection("passes")
      .where("period", "==", period).where("backAt", "==", null).limit(1).get();
    if (!outInPeriod.empty) throw new HttpsError("failed-precondition", "Someone is already out. Wait for them to return.");
  }

  const passRef = db.collection("passes").doc();
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(studentRef);
    const s = snap.data() || {};
    const remaining = typeof s.passesRemaining === "number" ? s.passesRemaining : settings.passesPerSemester;
    if (!exempt && remaining <= 0) {
      throw new HttpsError("failed-precondition", "You're out of passes. Ask your teacher for an override.");
    }
    tx.set(passRef, {
      studentDocId,
      studentIdNumber: s.studentNumber || "",
      studentName: s.name || "Student",
      period,
      destination,
      exempt,
      teacherOverride: false,
      outAt: admin.firestore.FieldValue.serverTimestamp(),
      backAt: null,
      durationSeconds: null,
      semester: settings.currentSemester,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const studentUpdate = { lastPassAt: admin.firestore.FieldValue.serverTimestamp() };
    if (!exempt) studentUpdate.passesRemaining = remaining - 1;
    tx.update(studentRef, studentUpdate);
    return { passesRemaining: exempt ? remaining : remaining - 1 };
  });

  return { studentName: student.name || "Student", destination, exempt, passesRemaining: result.passesRemaining };
};

/**
 * Close a student's open pass (kiosk re-entry or teacher "mark back").
 * Public — closing a pass is low-risk and has no self-service exploit.
 */
const hallPassReturn = async (request) => {
  const { studentDocId } = request.data || {};
  if (!studentDocId) throw new HttpsError("invalid-argument", "studentDocId is required.");
  const db = admin.firestore();

  const open = await db.collection("passes")
    .where("studentDocId", "==", studentDocId).where("backAt", "==", null)
    .orderBy("outAt", "desc").limit(1).get();
  if (open.empty) throw new HttpsError("not-found", "No open pass to close.");

  const ref = open.docs[0].ref;
  const data = open.docs[0].data();
  const outAt = data.outAt && data.outAt.toDate ? data.outAt.toDate() : new Date();
  const durationSeconds = Math.max(0, Math.round((Date.now() - outAt.getTime()) / 1000));
  await ref.update({ backAt: admin.firestore.FieldValue.serverTimestamp(), durationSeconds });
  return { studentName: data.studentName || "Student", durationSeconds };
};

/**
 * Teacher (auth): grant an override pass regardless of balance. Logged as
 * exempt + teacherOverride; never debits the balance.
 */
const hallPassOverride = async (request) => {
  requireStaff(request);
  const { studentDocId } = request.data || {};
  const destination = String((request.data && request.data.destination) || "restroom").trim().toLowerCase();
  if (!studentDocId) throw new HttpsError("invalid-argument", "studentDocId is required.");

  const db = admin.firestore();
  const settings = await getSettings(db);
  const student = (await db.collection("students").doc(studentDocId).get()).data();
  if (!student) throw new HttpsError("not-found", "Student not found.");

  await db.collection("passes").add({
    studentDocId,
    studentIdNumber: student.studentNumber || "",
    studentName: student.name || "Student",
    period: student.className || "",
    destination,
    exempt: true,
    teacherOverride: true,
    outAt: admin.firestore.FieldValue.serverTimestamp(),
    backAt: null,
    durationSeconds: null,
    semester: settings.currentSemester,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { studentName: student.name || "Student" };
};

/**
 * Teacher (auth): retroactively mark a pass exempt (e.g. it turned out to be a
 * nurse trip). Refunds one pass to the student if the pass had debited.
 */
const hallPassMarkExempt = async (request) => {
  requireStaff(request);
  const { passId } = request.data || {};
  if (!passId) throw new HttpsError("invalid-argument", "passId is required.");
  const db = admin.firestore();
  const settings = await getSettings(db);
  const passRef = db.collection("passes").doc(passId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(passRef);
    if (!snap.exists) throw new HttpsError("not-found", "Pass not found.");
    const p = snap.data();
    if (p.exempt) return; // already exempt — nothing to refund
    tx.update(passRef, { exempt: true });
    // Refund the debited pass, capped at the semester allotment.
    const studentRef = db.collection("students").doc(p.studentDocId);
    const sSnap = await tx.get(studentRef);
    const s = sSnap.data() || {};
    const remaining = typeof s.passesRemaining === "number" ? s.passesRemaining : settings.passesPerSemester;
    tx.update(studentRef, { passesRemaining: Math.min(settings.passesPerSemester, remaining + 1) });
  });
  return { ok: true };
};

/**
 * Teacher (auth): semester rollover. Pays out each active student's unused
 * passes to the classroom economy (unused × pointsPerUnusedPass, credited as a
 * negative-cost reward_purchase so it adds to the gross−spend balance), resets
 * passesRemaining, and advances the current semester. Historical pass records
 * keep their own `semester` tag and are never touched.
 */
const hallPassRollover = async (request) => {
  requireStaff(request);
  const newSemester = String((request.data && request.data.newSemester) || "").trim();
  if (!newSemester) throw new HttpsError("invalid-argument", "newSemester is required.");

  const db = admin.firestore();
  const settings = await getSettings(db);
  const oldSemester = settings.currentSemester;
  if (newSemester === oldSemester) {
    throw new HttpsError("failed-precondition", "New semester must differ from the current one (guards against a double run).");
  }

  const studentsSnap = await db.collection("students").get();
  const active = studentsSnap.docs.filter((d) => String(d.data().status || "").toLowerCase() !== "dropped");

  let totalPoints = 0;
  let studentsPaid = 0;
  let batch = db.batch();
  let ops = 0;
  const flush = async () => { if (ops) { await batch.commit(); batch = db.batch(); ops = 0; } };

  for (const d of active) {
    const s = d.data();
    const remaining = typeof s.passesRemaining === "number" ? s.passesRemaining : settings.passesPerSemester;
    const payout = Math.max(0, remaining) * settings.pointsPerUnusedPass;
    if (payout > 0) {
      batch.set(db.collection("reward_purchases").doc(), {
        studentId: d.id,
        rewardId: "hall-pass-payout",
        rewardName: `Hall Pass Payout (${oldSemester})`,
        cost: -payout, // negative cost = credit to the economy balance
        status: "approved",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      totalPoints += payout;
      studentsPaid++;
      ops++;
    }
    batch.update(d.ref, { passesRemaining: settings.passesPerSemester });
    ops++;
    if (ops >= 400) await flush();
  }
  await flush();

  await db.collection("settings").doc("hallPass").set(
    { currentSemester: newSemester, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  await db.collection("hallPassPayouts").add({
    semester: oldSemester,
    newSemester,
    studentsPaid,
    totalPoints,
    ranAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { oldSemester, newSemester, studentsPaid, totalPoints };
};

module.exports = {
  hallPassLookup,
  hallPassCheckout,
  hallPassReturn,
  hallPassOverride,
  hallPassMarkExempt,
  hallPassRollover,
};
