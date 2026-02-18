const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// Import the new createUser function
const { createUser } = require("./createUser");

// Export the new createUser function as a callable function
exports.createUser = functions.https.onCall(createUser);
