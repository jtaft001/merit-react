// Shared timezone-aware date helpers for the timeclock / payroll pipeline.
// Every "dateStr" key in the system (sessions, warnings, pay periods) is a
// YYYY-MM-DD calendar date in THIS zone — not UTC. Keeping all date math in one
// place avoids the off-by-one-day bugs that happen when toISOString() is used on
// afternoon/evening Pacific timestamps.

const TIMEZONE = "America/Los_Angeles";

/** YYYY-MM-DD for the given instant, in TIMEZONE. */
function toDateStr(date, tz = TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Offset (ms) of `tz` from UTC at the given instant, i.e. (wallClock - UTC). */
function tzOffsetMs(date, tz = TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  // Intl may emit hour "24" at midnight in some runtimes — normalize to 0.
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - date.getTime();
}

/** UTC instant of local midnight (inclusive start) for a YYYY-MM-DD in `tz`. */
function startOfDayUtc(dateStr, tz = TIMEZONE) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = tzOffsetMs(new Date(guess), tz);
  return new Date(guess - offset);
}

/** UTC instant of the start of the NEXT local day (exclusive end) for a YYYY-MM-DD. */
function endOfDayUtc(dateStr, tz = TIMEZONE) {
  const start = startOfDayUtc(dateStr, tz);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

module.exports = { TIMEZONE, toDateStr, startOfDayUtc, endOfDayUtc, tzOffsetMs };
