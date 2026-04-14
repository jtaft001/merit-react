const admin = require("firebase-admin");
const { onCall } = require("firebase-functions/v2/https");
const { firestore } = require("firebase-functions/v1");

admin.initializeApp();

const { createUser } = require("./createUser");
const { generatePayroll } = require("./generatePayroll");
const { onTimeclockEvent, backfillSessions } = require("./processTimeclock");
const { nfcClock } = require("./nfcClock");
const { nfcLookup } = require("./nfcLookup");
const { getMyClockStatus, getMyAttendance } = require("./studentFunctions");

exports.createUser = onCall(createUser);
exports.generatePayroll = onCall(generatePayroll);
exports.backfillSessions = onCall(backfillSessions);
exports.onTimeclockEvent = firestore
  .document("timeclock/{docId}")
  .onCreate(onTimeclockEvent);

// NFC kiosk — no auth required (public kiosk tablet)
exports.nfcLookup = onCall({ invoker: "public" }, nfcLookup);
exports.nfcClock  = onCall({ invoker: "public" }, nfcClock);

// Mobile student app — auth required
exports.getMyClockStatus = onCall(getMyClockStatus);
exports.getMyAttendance  = onCall(getMyAttendance);
