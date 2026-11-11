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
 *   locked?: boolean,
 *   formatTime?: function((string|undefined)): (string|undefined)
 * }} options
 *   viewerEmail  the reader; "" or absent means unknown, and then nobody is
 *                filtered or marked (one person too many beats hiding a colleague)
 *   countSelf    true keeps the reader in, marked "(current user)"
 *   locked       web components only: the case lock leads the summary
 *   formatTime   how to say when someone arrived; CCPJoined.format by default
 * @returns {{people: CCPPerson[], count: number, includesSelf: boolean, summary: string, lines: string[]}}
 */
CCPView.build = function (options) {
  var me = options.viewerEmail || "";
  var members = options.members || [];
  var format = options.formatTime || CCPJoined.format;
  var people = CCPPeople.collapse(options.countSelf ? members : CCPPeople.others(members, me), me);
  var includesSelf = false;
  var lines = [];
  var i, person;
  for (i = 0; i < people.length; i++) {
    person = people[i];
    if (person.isCurrentUser) {
      includesSelf = true;
    }
    lines.push(CCPContent.personLine(
      CCPPeople.displayName(person),
      CCPSectionNames.describe(person.sections),
      CCPContent.where(person.apps, format)
    ));
  }
  return {
    people: people,
    count: people.length,
    includesSelf: includesSelf,
    summary: CCPContent.summary(people.length, includesSelf, options.locked),
    lines: lines
  };
};
