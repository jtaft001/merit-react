const admin = require("firebase-admin");
const functions = require("firebase-functions");

const createUser = async (data, context) => {
  // Check if the user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be authenticated to create a user."
    );
  }

  const { email, password, firstName, lastName } = data;

  if (!email || !password || !firstName || !lastName) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Please provide all required fields."
    );
  }

  try {
    // Create the user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
    });

    // Create the student document in Firestore
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
    throw new functions.https.HttpsError("internal", error.message);
  }
};

module.exports = {
  createUser,
};
