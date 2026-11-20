/* features/watchdog/core/order.js — THE ORDER a roster reads in. SHARED, MODE 5 FLOOR.
 *
 * Every ordering rule presence has, in one file, for all three UIs. Nothing else
 * sorts: CCPPeople.collapse orders people and their applications through here, and
 * CCPSectionNames.describe orders the sections it names.
 *
 * WHY. Rosters used to read in first-appearance order, which is whatever order the
 * Watchdog listed members in and our sections were added in. Neither holds still:
 * one person arriving could re-send a snapshot in a different order and reshuffle
 * every line, and the applications within each line, along with it.
 *
 * THE RULE IS ARRIVAL. People by when they first arrived (in any application),
 * and each person's applications by when they arrived in that one. joinedAt does
 * not change while a session lives, so a newcomer goes to the bottom and nobody
 * else moves; someone leaving takes only their own line; the "since" times read in
 * order down the list. Anything with no time follows everything that has one.
 * Ties, and the untimed, fall back to the alphabet, so the order is total and
 * never depends on how the input happened to arrive.
 *
 * "-ISH": joinedAt resets when a session is re-created (a legacy client replacing
 * an evicted session, the web component reconnecting), and that entry moves to the
 * bottom — to the server they really have just arrived.
 *
 * SECTIONS ARE NOT ARRIVAL: a fixed reading order, broadest first, so one person's
 * line always names the same sections the same way round.
 *
 * Times are compared as strings: correct for the ISO-8601 the API sends, and it
 * avoids parsing dates at the mode 5 floor.
 */

var CCPOrder = {};

/** The order sections are named in. Kinds not listed follow, alphabetically. */
CCPOrder.SECTION_KINDS = [CCPKinds.CASE, CCPKinds.CASE_REVIEW, CCPKinds.DEFENDANT, CCPKinds.VICTIM_WITNESS];

/**
 * Earlier first; a missing time after any real one.
 *
 * @param {string|undefined} a
 * @param {string|undefined} b
 * @returns {number}
 */
CCPOrder.compareTimes = function (a, b) {
  if (a === b || (!a && !b)) {
    return 0;
  }
  if (!a) {
    return 1;
  }
  if (!b) {
    return -1;
  }
  return a < b ? -1 : 1;
};

/**
 * @param {string|undefined} a
 * @param {string|undefined} b
 * @returns {number}
 */
CCPOrder.compareText = function (a, b) {
  var x = String(a || "").toLowerCase();
  var y = String(b || "").toLowerCase();
  if (x === y) {
    return 0;
  }
  return x < y ? -1 : 1;
};

/**
 * When someone first arrived in any application: the earliest timeEntered, or
 * undefined when none is known.
 *
 * @param {{apps: Array<{timeEntered: (string|undefined)}>}} person
 * @returns {string|undefined}
 */
CCPOrder.arrival = function (person) {
  var earliest;
  var i;
  for (i = 0; i < person.apps.length; i++) {
    if (CCPOrder.compareTimes(person.apps[i].timeEntered, earliest) < 0) {
      earliest = person.apps[i].timeEntered;
    }
  }
  return earliest;
};

/**
 * People, in place: by arrival, then by address.
 *
 * @param {CCPPerson[]} people
 * @returns {CCPPerson[]}
 */
CCPOrder.people = function (people) {
  return people.sort(function (a, b) {
    return CCPOrder.compareTimes(CCPOrder.arrival(a), CCPOrder.arrival(b)) || CCPOrder.compareText(a.username, b.username);
  });
};

/**
 * One person's applications, in place: by arrival in each, then by name.
 *
 * @param {Array<{appDisplayName: string, timeEntered: (string|undefined)}>} apps
 * @returns {Array<{appDisplayName: string, timeEntered: (string|undefined)}>}
 */
CCPOrder.apps = function (apps) {
  return apps.sort(function (a, b) {
    return CCPOrder.compareTimes(a.timeEntered, b.timeEntered) || CCPOrder.compareText(a.appDisplayName, b.appDisplayName);
  });
};

/**
 * Where a section kind falls in SECTION_KINDS; unknown kinds after every known one.
 *
 * @param {string} kind
 * @returns {number}
 */
CCPOrder.sectionRank = function (kind) {
  var i;
  var upper = String(kind || "").toUpperCase();
  for (i = 0; i < CCPOrder.SECTION_KINDS.length; i++) {
    if (CCPOrder.SECTION_KINDS[i] === upper) {
      return i;
    }
  }
  return CCPOrder.SECTION_KINDS.length;
};

/**
 * Section kinds, in place: the fixed order, then the alphabet.
 *
 * @param {string[]} kinds
 * @returns {string[]}
 */
CCPOrder.sectionKinds = function (kinds) {
  return kinds.sort(function (a, b) {
    return CCPOrder.sectionRank(a) - CCPOrder.sectionRank(b) || CCPOrder.compareText(a, b);
  });
};
