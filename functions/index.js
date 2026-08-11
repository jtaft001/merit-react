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
const {
  hallPassLookup,
  hallPassCheckout,
  hallPassReturn,
  hallPassOverride,
  hallPassMarkExempt,
} = require("./hallPass");

// invoker:"public" lets the browser reach the function; auth is still enforced
// in-code (request.auth + token.staff). Without this, Workspace org policy can
// strip the allUsers invoker binding → preflight fails as a CORS error.
exports.createUser = onCall({ invoker: "public" }, createUser);
exports.generatePayroll = onCall(generatePayroll);
exports.backfillSessions = onCall({ memory: "512MiB" }, backfillSessions);
exports.onTimeclockEvent = firestore
  .document("timeclock/{docId}")
  .onCreate(onTimeclockEvent);

// NFC kiosk — no auth required (public kiosk tablet)
exports.nfcLookup = onCall({ invoker: "public" }, nfcLookup);
exports.nfcClock  = onCall({ invoker: "public" }, nfcClock);

// Mobile student app — auth required
exports.getMyClockStatus = onCall(getMyClockStatus);
exports.getMyAttendance  = onCall(getMyAttendance);

// Hall pass — kiosk endpoints are public (shared Chromebook); teacher endpoints
// enforce the staff claim in-code.
exports.hallPassLookup     = onCall({ invoker: "public" }, hallPassLookup);
exports.hallPassCheckout   = onCall({ invoker: "public" }, hallPassCheckout);
exports.hallPassReturn     = onCall({ invoker: "public" }, hallPassReturn);
exports.hallPassOverride   = onCall({ invoker: "public" }, hallPassOverride);
exports.hallPassMarkExempt = onCall({ invoker: "public" }, hallPassMarkExempt);
