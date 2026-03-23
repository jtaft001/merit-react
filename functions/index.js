const admin = require("firebase-admin");
const { onCall } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");

admin.initializeApp();

const { createUser } = require("./createUser");
const { generatePayroll } = require("./generatePayroll");
const { onTimeclockEvent, backfillSessions } = require("./processTimeclock");

exports.createUser = onCall(createUser);
exports.generatePayroll = onCall(generatePayroll);
exports.backfillSessions = onCall(backfillSessions);
exports.onTimeclockEvent = onDocumentCreated("timeclock/{docId}", onTimeclockEvent);
