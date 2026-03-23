const admin = require("firebase-admin");
const { onCall } = require("firebase-functions/v2/https");

admin.initializeApp();

const { createUser } = require("./createUser");
const { generatePayroll } = require("./generatePayroll");

exports.createUser = onCall(createUser);
exports.generatePayroll = onCall(generatePayroll);
