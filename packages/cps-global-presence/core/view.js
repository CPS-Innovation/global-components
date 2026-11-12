/* core/view.js — what a presence banner shows, worked out once for all three UIs.
 *
 * In: the flat member records for what is on screen (CCPRoster.members, or the
 * web components' equivalent). Out: the people, the one-line summary and one line
 * per person. Each UI only draws the result.
 *
 * One line per PERSON, not per section: someone on the case and editing a witness
 * within it is one person, and their line names both sections.
 */

var CCPView = {};

/**
 * @param {{
 *   members: CCPRosterMember[] | undefined,
 *   viewerEmail?: string,
 *   countSelf?: boolean,
 *   lock?: {firstNames?: string, surname?: string, application?: string, since?: string},
 *   formatTime?: function((string|undefined)): (string|undefined)
 * }} options
 *   viewerEmail  the reader; "" or absent means unknown, and then nobody is
 *                filtered or marked (one person too many beats hiding a colleague)
 *   countSelf    true keeps the reader in, marked "(current user)"
 *   lock         web components only, and only when the case IS locked: who
 *                holds it as CMS names them, and where and since when. It leads
 *                the summary and the lines, and joins its holder's own line when
 *                exactly one person present is them (CCPNames.matches); otherwise
 *                it is a line of its own
 *   formatTime   how to say when someone arrived; CCPJoined.format by default
 * @returns {{people: CCPPerson[], count: number, includesSelf: boolean, summary: string, lockedByReader: boolean, lines: string[]}}
 */
CCPView.build = function (options) {
  var me = options.viewerEmail || "";
  var members = options.members || [];
  var format = options.formatTime || CCPJoined.format;
  var lock = options.lock || null;
  var people = CCPPeople.collapse(options.countSelf ? members : CCPPeople.others(members, me), me);
  var holder = CCPView.lockHolder(people, lock);
  // THE READER MAY BE THE HOLDER — locked in Classic, now looking here. That is
  // said as "You", on a line of its own, never as their name: their own name
  // reads as a colleague's. Like every match, only when unambiguous: if someone
  // present could equally be the holder, neither is assumed.
  var byReader = !!lock && CCPNames.matches(me, lock.firstNames, lock.surname);
  if (byReader && holder !== -1) {
    byReader = false;
    holder = -1;
  }
  var includesSelf = false;
  var lines = [];
  var i, person, line;
  var holderClause = lock && holder !== -1 ? CCPContent.lockClause(lock.application || "", format(lock.since)) : undefined;
  if (lock && holder === -1) {
    lines.push(CCPContent.lockLine(CCPView.lockHolderName(lock), lock.application || "", format(lock.since), byReader));
  }
  for (i = 0; i < people.length; i++) {
    person = people[i];
    if (person.isCurrentUser) {
      includesSelf = true;
    }
    line = CCPContent.personLine(
      CCPPeople.displayName(person),
      CCPSectionNames.describe(person.sections),
      CCPContent.where(person.apps, format),
      i === holder ? holderClause : undefined
    );
    // The lock leads, here as in the summary.
    if (i === holder) {
      lines.unshift(line);
    } else {
      lines.push(line);
    }
  }
  return {
    people: people,
    count: people.length,
    includesSelf: includesSelf,
    summary: CCPContent.summary(people.length, includesSelf, !!lock, byReader),
    lockedByReader: byReader,
    lines: lines
  };
};

/**
 * Which of the people holds the lock: their index, or -1. Only a SINGLE match
 * counts — two namesakes on one case (john.smith and john.smith2) could be either,
 * and the lock then stands on its own line rather than on a guess.
 *
 * The reader is never the answer here, even when counted in: a lock of theirs is
 * said as "You", on its own line (see build).
 *
 * @param {CCPPerson[]} people
 * @param {{firstNames?: string, surname?: string}|null} lock
 * @returns {number}
 */
CCPView.lockHolder = function (people, lock) {
  var found = -1;
  var i;
  if (!lock) {
    return -1;
  }
  for (i = 0; i < people.length; i++) {
    if (!people[i].isCurrentUser && CCPNames.matches(people[i].username, lock.firstNames, lock.surname)) {
      if (found !== -1) {
        return -1;
      }
      found = i;
    }
  }
  return found;
};

/**
 * The holder as CMS names them, "" when it names nobody.
 *
 * @param {{firstNames?: string, surname?: string}} lock
 * @returns {string}
 */
CCPView.lockHolderName = function (lock) {
  var parts = [];
  if (lock.firstNames) {
    parts.push(lock.firstNames);
  }
  if (lock.surname) {
    parts.push(lock.surname);
  }
  return parts.join(" ");
};
