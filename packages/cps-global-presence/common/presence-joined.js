/* common/presence-joined.js — WHEN SOMEONE ARRIVED, said the way a person would
 * say it. SHARED, MODE 5 FLOOR.
 *
 *   today      "3.38pm"
 *   yesterday  "3.38pm yesterday"
 *   before     "3.38pm on 21 September 2026"
 *
 * The date is noise on the common case. Almost everyone this reports on arrived
 * minutes ago, and "3.38pm on 8 September 2026" makes the reader check the date
 * before realising it says "this afternoon". Naming the day only when it is not
 * today puts the emphasis where the information is.
 *
 * GDS style for the parts that remain: no leading zero on the hour, a full stop
 * rather than a colon, lower-case am/pm, the month spelled out.
 *
 * THIS WAS WRITTEN THREE TIMES before it was written here — once per client, in
 * three different formats, so the same arrival read three ways depending on which
 * product you were looking at. That is exactly the kind of fact that belongs
 * beside the application and section names.
 *
 * PARSED BY HAND, NOT BY Date. Document mode 5 cannot reliably Date.parse an ISO
 * string — it returns NaN — so the fields are read out of the string with a regex
 * and reassembled through Date.UTC, which ES3 does have. That also fixes a quiet
 * bug in the oldest of the three: reading the wall-clock fields and printing them
 * as-is showed a UTC timestamp as though it were local, an hour out all summer.
 * The offset is applied, so the result is the reader's own clock.
 */

var CCPJoined = {};

CCPJoined.MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// "2026-08-21T08:11:53.226+00:00", "…Z", "…+01:00", "…+0100", and the seconds and
// fraction are optional. A trailing offset is the only part we go looking for
// beyond the obvious: without it the instant is ambiguous.
CCPJoined.ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * An ISO-8601 timestamp as a Date, or null when it is not one.
 *
 * A string with NO offset is read as UTC. Every timestamp this sees comes from
 * the presence API and is UTC; guessing "local" for an unmarked one would put a
 * server time an hour out for half the year rather than admit it does not know.
 *
 * @param {string|undefined} iso
 * @returns {Date|null}
 */
CCPJoined.parse = function (iso) {
  var m, offset, sign, hours, minutes, ms, year, month, day, hour, minute, second, millis, check;
  if (!iso || typeof iso !== "string") {
    return null;
  }
  m = CCPJoined.ISO.exec(iso);
  if (!m) {
    return null;
  }
  year = parseInt(m[1], 10);
  month = parseInt(m[2], 10) - 1;
  day = parseInt(m[3], 10);
  hour = parseInt(m[4], 10);
  minute = parseInt(m[5], 10);
  second = m[6] ? parseInt(m[6], 10) : 0;
  // Milliseconds kept rather than discarded, so a parsed instant is the same
  // instant an engine that can read ISO would produce, to the millisecond. The
  // fraction can be any length; three digits is what a millisecond is.
  millis = m[7] ? parseInt((m[7] + "00").substr(0, 3), 10) : 0;

  ms = Date.UTC(year, month, day, hour, minute, second, millis);
  if (isNaN(ms)) {
    return null;
  }
  // ROLLOVER IS NOT ACCEPTANCE. Date.UTC happily turns month 13 into next January
  // and hour 99 into four days later, so "2026-13-45T99:99" would parse as a real
  // and entirely fictitious date. Reading the fields back is the cheapest complete
  // range check there is — it rejects exactly what rolled over, leap years and
  // month lengths included, without a table of days per month.
  check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  ) {
    return null;
  }

  offset = m[8];
  if (offset && offset !== "Z") {
    sign = offset.charAt(0) === "-" ? -1 : 1;
    hours = parseInt(offset.substr(1, 2), 10);
    minutes = parseInt(offset.substr(offset.length - 2), 10);
    ms = ms - sign * (hours * 60 + minutes) * 60000;
  }
  return new Date(ms);
};

/** Midnight at the start of a date, in local time — the unit "yesterday" counts in. */
CCPJoined.startOfDay = function (date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

/**
 * Returns "" rather than a fallback string when there is nothing usable, so
 * callers can drop the clause entirely instead of printing "since Invalid Date".
 * joinedAt is optional on the API's member record and we do not control whether
 * it arrives.
 *
 * @param {string|undefined} iso
 * @param {Date} [now] injectable so the boundary cases can be tested; callers pass nothing
 * @returns {string}
 */
CCPJoined.format = function (iso, now) {
  var at = CCPJoined.parse(iso);
  var hours24, hours, minutes, meridiem, time, days;
  if (!at) {
    return "";
  }
  now = now || new Date();

  hours24 = at.getHours();
  hours = hours24 % 12 === 0 ? 12 : hours24 % 12;
  minutes = at.getMinutes() < 10 ? "0" + at.getMinutes() : String(at.getMinutes());
  meridiem = hours24 < 12 ? "am" : "pm";
  time = hours + "." + minutes + meridiem;

  // Compared as CALENDAR DAYS, not as elapsed hours: 11pm and 1am are two hours
  // apart and different days, which is what a reader means by "yesterday".
  days = Math.round((CCPJoined.startOfDay(now) - CCPJoined.startOfDay(at)) / 86400000);
  if (days === 0) {
    return time;
  }
  if (days === 1) {
    return time + " yesterday";
  }
  // Anything else — including a timestamp in the future, which should not happen
  // but reads better as a date than as "in -3 days".
  return time + " on " + at.getDate() + " " + CCPJoined.MONTHS[at.getMonth()] + " " + at.getFullYear();
};
