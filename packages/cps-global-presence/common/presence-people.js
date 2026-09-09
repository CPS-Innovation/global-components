/* common/presence-people.js — one row per PERSON, not per registration.
 * SHARED, MODE 5 FLOOR.
 *
 * WHAT THE API GIVES US is denormalised: one member record per user, per section,
 * per application. The same person on the case AND editing a witness within it,
 * from two OutSystems apps, is four records. Rendered literally that is four
 * people, or one person listed four times, and neither is true.
 *
 * WHAT A UI NEEDS is the person, once, with the applications they are in. So this
 * collapses on two keys:
 *
 *   PERSON, by email case-insensitively — the server derives it from token claims
 *   and its casing is not ours to rely on. The first spelling seen is the one
 *   reported, so the display keeps whatever the server actually sent.
 *
 *   APPLICATION, by DISPLAY name, after CCPApps has mapped it. That is the whole
 *   point of collapsing here rather than in each UI: Work Management App and Case
 *   Review App are both RCMS, so someone in both is in ONE application as far as a
 *   user is concerned, not two.
 *
 * timeEntered is the EARLIEST joinedAt seen for that person in that application.
 * When two records collapse into one, the answer to "since when" is when they
 * arrived, not when the later of two registrations happened to be made.
 *
 * FORMAT IS NOT OUR JOB: timeEntered is passed through exactly as the API sent it.
 * Each client formats dates its own way, and the two legacy ones cannot use the
 * facilities the web components have.
 *
 * ORDER is first appearance, for people and for their applications. Stable across
 * polls as long as the server's own order is stable, so a UI does not reshuffle
 * under the reader.
 */

var CCPPeople = {};

// Array.prototype.indexOf does not exist at document mode 5.
CCPPeople.indexOf = function (list, value) {
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i] === value) {
      return i;
    }
  }
  return -1;
};

// The section entry for a kind, or null. Kind is the identity here: two witnesses
// are two SECTIONS but one phrase, and a UI that said "a witness or victim and a
// witness or victim" would be repeating itself rather than informing.
function findSection(sections, kind) {
  var i;
  for (i = 0; i < sections.length; i++) {
    if (sections[i].kind === kind) {
      return sections[i];
    }
  }
  return null;
}

// The app entry for a display name, or null. Its own function so collapse() below
// reads as the two decisions it actually makes — which person, which application —
// rather than as three nested loops.
/**
 * @param {Array<{appDisplayName: string, timeEntered: string|undefined}>} apps
 * @param {string} appDisplayName
 * @returns {{appDisplayName: string, timeEntered: string|undefined}|null}
 */
function findApp(apps, appDisplayName) {
  var j;
  for (j = 0; j < apps.length; j++) {
    if (apps[j].appDisplayName === appDisplayName) {
      return apps[j];
    }
  }
  return null;
}

/**
 * @param {Array<{userEmail?: string, sourceApplication?: string, joinedAt?: string, sections?: Array<{kind: string, isCurrent?: boolean}>}>} members
 *        Every member record, from every section, flattened. Callers hold the
 *        sections differently; this deliberately takes the flat list they can all
 *        produce.
 * @returns {Array<{username: string, apps: Array<{appDisplayName: string, timeEntered: string|undefined}>, sections: Array<{kind: string, isCurrent: boolean}>}>}
 */
CCPPeople.collapse = function (members) {
  var byUser = {};
  var order = [];
  var out = [];
  var i, member, id, person, appName, found, sections, k;

  if (!members || !members.length) {
    return out;
  }

  for (i = 0; i < members.length; i++) {
    member = members[i];
    if (!member) {
      continue;
    }
    id = String(member.userEmail ? member.userEmail : "").toLowerCase();
    if (!id) {
      continue; // a record with nobody in it says nothing
    }
    if (!byUser.hasOwnProperty(id)) {
      byUser[id] = { username: member.userEmail, apps: [], sections: [] };
      order.push(id);
    }
    person = byUser[id];

    // WHICH PARTS OF THE CASE they are in, unioned across every record. A case-wide
    // session reports everyone anywhere in the case, so without this a UI can only
    // say "this case" — true of everybody, and therefore no help.
    //
    // isCurrent survives the union: if ANY record puts them in the very section the
    // reader is looking at, that is the fact worth reporting, and a later record
    // from elsewhere in the case must not quietly downgrade it.
    sections = member.sections || [];
    for (k = 0; k < sections.length; k++) {
      if (!sections[k] || !sections[k].kind) {
        continue;
      }
      found = findSection(person.sections, sections[k].kind);
      if (!found) {
        person.sections.push({ kind: sections[k].kind, isCurrent: !!sections[k].isCurrent });
      } else if (sections[k].isCurrent) {
        found.isCurrent = true;
      }
    }

    appName = CCPApps.displayName(member.sourceApplication);
    if (!appName) {
      continue; // present, but the API did not say where — the person still counts
    }

    found = findApp(person.apps, appName);
    if (!found) {
      person.apps.push({ appDisplayName: appName, timeEntered: member.joinedAt });
      continue;
    }
    // Earliest wins. String comparison is correct for the ISO-8601 the API sends,
    // and avoids parsing dates at the mode 5 floor.
    if (member.joinedAt && (!found.timeEntered || member.joinedAt < found.timeEntered)) {
      found.timeEntered = member.joinedAt;
    }
  }

  for (i = 0; i < order.length; i++) {
    out.push(byUser[order[i]]);
  }
  return out;
};
