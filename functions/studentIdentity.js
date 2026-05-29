const admin = require("firebase-admin");

/**
 * Canonical student identity resolver.
 *
 * The canonical studentId across the whole system is the `students` document ID.
 * Different ingest paths historically wrote different things into
 * `timeclock.studentId`:
 *   - Google Form  -> the student's display name (e.g. "Elly Blair")
 *   - NFC kiosk    -> the students doc ID (already canonical)
 *
 * This resolver maps ANY of those raw values back to the canonical doc ID so
 * sessions/payroll converge on one identity per student. Resolution order:
 *   1. value is already a doc ID            -> itself
 *   2. matches a student's `formName`       -> that doc ID   (nickname alias)
 *   3. matches an entry in `aliases[]`      -> that doc ID
 *   4. matches a student's `name`           -> that doc ID
 *   5. no match (e.g. a clock-in user with no account) -> the raw value,
 *      so account-less students keep working exactly as before (name-keyed).
 */

const norm = (s) => (s || "").toString().trim().replace(/\s+/g, " ").toLowerCase();

/** Build a resolver from an already-fetched students QuerySnapshot (no extra read). */
function buildResolverFromDocs(docs) {
  const byDocId = new Set();
  const byFormName = new Map();
  const byAlias = new Map();
  const byName = new Map();

  docs.forEach((doc) => {
    byDocId.add(doc.id);
    const v = doc.data() || {};
    if (v.formName) byFormName.set(norm(v.formName), doc.id);
    if (Array.isArray(v.aliases)) {
      v.aliases.forEach((a) => byAlias.set(norm(a), doc.id));
    }
    if (v.name) byName.set(norm(v.name), doc.id);
  });

  return function resolve(rawId) {
    if (!rawId) return rawId;
    if (byDocId.has(rawId)) return rawId;
    const key = norm(rawId);
    return byFormName.get(key) || byAlias.get(key) || byName.get(key) || rawId;
  };
}

/** Build a resolver, fetching the students collection once. */
async function buildResolver(db) {
  const snap = await db.collection("students").get();
  return buildResolverFromDocs(snap.docs);
}

module.exports = { buildResolver, buildResolverFromDocs, norm };