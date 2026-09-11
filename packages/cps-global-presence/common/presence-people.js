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
CCPPeople.collapse = function (members, viewerEmail) {
  var byUser = {};
  var order = [];
  var out = [];
  var i, member, id, person, appName, found, sections, k;
  var me = String(viewerEmail || "").toLowerCase();

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
      byUser[id] = {
        username: member.userEmail,
        apps: [],
        sections: [],
        // Compared on the same lowercased id the collapse already keys on, so the
        // server's casing — which comes from token claims and is not ours to rely
        // on — cannot make the reader fail to recognise themselves.
        isCurrentUser: !!me && id === me
      };
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

/**
 * Everyone BUT the reader.
 *
 * Telling someone that they are working on the case they are looking at is noise,
 * and on a case only they are on it turns an empty roster into a false alarm. The
 * web components have always done this; the legacy clients could not, because
 * nothing on the page knew who the reader was until the whoami op existed.
 *
 * FILTERS NOBODY WHEN THE VIEWER IS UNKNOWN, and that asymmetry is deliberate. ""
 * means whoami has not answered yet, or there is no token, or the claim was
 * missing — and in every one of those cases showing one person too many is a much
 * smaller failure than hiding everyone. It also doubles as the dev override: pass
 * "" to count yourself, which is what CCPPeople's caller does when it wants a lone
 * developer to be able to see the mechanism working.
 *
 * Compared case-insensitively. The server derives the address from token claims
 * and its casing is not ours to rely on — the real capture this was built against
 * had mixed case on both sides.
 *
 * @param {Array<{userEmail?: string}>|undefined} members
 * @param {string|undefined} viewerEmail
 * @returns {Array} the members that are not the reader
 */
CCPPeople.others = function (members, viewerEmail) {
  var out = [];
  var me, i, email;
  if (!members) {
    return out;
  }
  me = String(viewerEmail || "").toLowerCase();
  if (!me) {
    for (i = 0; i < members.length; i++) {
      out.push(members[i]);
    }
    return out;
  }
  for (i = 0; i < members.length; i++) {
    email = members[i] ? String(members[i].userEmail || "").toLowerCase() : "";
    if (email !== me) {
      out.push(members[i]);
    }
  }
  return out;
};

/**
 * WHAT TO SHOW AS SOMEONE'S NAME, marking the reader.
 *
 * While the feature is being built we deliberately count and show ourselves: a
 * roster that includes you, and says so, is the only evidence from the outside
 * that the identification works at all. Filtering silently proves nothing — an
 * empty banner looks identical whether self-detection is working or the whole
 * presence mechanism is broken.
 *
 * When that stops being useful, filter with CCPPeople.others instead and this
 * suffix stops appearing on its own: nobody left in the list is the reader.
 *
 * @param {{username?: string, isCurrentUser?: boolean}} person
 * @returns {string}
 */
CCPPeople.displayName = function (person) {
  if (!person || !person.username) {
    return "";
  }
  return person.isCurrentUser ? person.username + CCPPeople.CURRENT_USER_SUFFIX : person.username;
};

// In brackets after the name rather than replacing it with "you": the address is
// still the thing a reader matches against what the API reported, and a roster
// that renamed one row would be harder to check, not easier.
CCPPeople.CURRENT_USER_SUFFIX = " (current user)";
