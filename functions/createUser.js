const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");

const createUser = async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be authenticated to create a user."
    );
  }

  if (!request.auth.token.staff) {
    throw new HttpsError(
      "permission-denied",
      "Only admins can create users."
    );
  }

  const { email, password, firstName, lastName } = request.data;
  // Optional roster fields. `studentNumber` is the SCHOOL's ID number — it is
  // deliberately separate from the Firestore/auth key (the doc id == uid).
  const { grade, studentNumber, classId, className } = request.data;

  if (!email || !password || !firstName || !lastName) {
    throw new HttpsError(
      "invalid-argument",
      "Please provide all required fields."
    );
  }

  try {
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
    });

    const studentDoc = {
      authUid: userRecord.uid,
      email: email,
      firstName: firstName,
      lastName: lastName,
      name: `${firstName} ${lastName}`,
      status: "Active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Only write optional fields when provided, so we never overwrite with undefined.
    if (grade != null && grade !== "") studentDoc.grade = String(grade);
    if (studentNumber != null && studentNumber !== "")
      studentDoc.studentNumber = String(studentNumber);
    if (classId != null && classId !== "") studentDoc.classId = String(classId);
    if (className != null && className !== "")
      studentDoc.className = String(className);

    const studentDocRef = admin
      .firestore()
      .collection("students")
      .doc(userRecord.uid);
    await studentDocRef.set(studentDoc);

    return { uid: userRecord.uid };
  } catch (error) {
    console.error("createUser failed:", error);
    // Surface only safe, expected client errors; hide internal details otherwise.
    if (error && typeof error.code === "string" && error.code.startsWith("auth/")) {
      throw new HttpsError("invalid-argument", error.message);
    }
    throw new HttpsError("internal", "Could not create user.");
  }
};

module.exports = { createUser };
