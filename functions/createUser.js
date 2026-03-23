const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");

const createUser = async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be authenticated to create a user."
    );
  }

  const { email, password, firstName, lastName } = request.data;

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

    const studentDocRef = admin.firestore().collection("students").doc(userRecord.uid);
    await studentDocRef.set({
      authUid: userRecord.uid,
      email: email,
      firstName: firstName,
      lastName: lastName,
      name: `${firstName} ${lastName}`,
      status: "Active",
    });

    return { uid: userRecord.uid };
  } catch (error) {
    throw new HttpsError("internal", error.message);
  }
};

module.exports = { createUser };
