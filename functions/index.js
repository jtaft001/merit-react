const admin = require("firebase-admin");
const { onCall } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");

admin.initializeApp();

const { createUser } = require("./createUser");
const { generatePayroll } = require("./generatePayroll");
const { onTimeclockEvent, backfillSessions } = require("./processTimeclock");

exports.createUser = onCall(createUser);
exports.generatePayroll = onCall(generatePayroll);
exports.backfillSessions = onCall(backfillSessions);
exports.onTimeclockEvent = functions.firestore
  .document("timeclock/{docId}")
  .onCreate(onTimeclockEvent);
