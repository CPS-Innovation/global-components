/* common/presence-content.js — THE WORDS. SHARED, MODE 5 FLOOR.
 *
 * Every sentence presence shows a reader, in one file, for all three UIs: the web
 * component (cps-global-case-locking-notification), the Modern/DCF banner and the
 * Classic stripe.
 *
 * WHY IT EXISTS. The same sentences were written three times. The web component
 * and Modern had drifted into agreement by hand — Modern's main.js carried the
 * comment "worded as the web components word it", which is a promise no build can
 * keep — and Classic had never agreed with either: it said "4 users currently
 * working on the case" under a heading reading "Who's working where:", listing
 * "a.b@cps.gov.uk on RCMS - joined 3.38pm" where the others said
 * "A Name — RCMS since 3.38pm on 8 September 2026". Three surfaces, three
 * voices, one feature.
 *
 * THE WEB COMPONENT'S WORDING WON, wholesale. It is the version that has had the
 * most thought spent on it — see the reasoning preserved below on "other", on
 * where the lock sits in the sentence, and on naming the section rather than
 * saying "this case" to everybody — and Classic's was simply wrong. So Classic's
 * phrasings are not represented here at all; they were deleted, not merged.
 *
 * WHY HERE. common/ is already the seam: it is held to the DOCUMENT MODE 5 floor
 * so both legacy clients can run it, and it is published as the ESM the web
 * components import (CCPPeople and CCPSectionNames arrive that way today). So
 * this needs no new mechanism — only one more module in a folder that already
 * does exactly this job.
 *
 * WHAT IS NOT HERE. Anything that reads data. This file assembles words from
 * pieces its callers have already derived, so it stays a content file: no roster,
 * no API shapes, no clock. The one exception is `where`, which takes the caller's
 * own time formatter, because the ", " between applications and the " since "
 * before a time are both content decisions and belong beside the rest.
 *
 * CCPPeople.CURRENT_USER_SUFFIX is content too, and stays where it is: it was
 * never duplicated, so moving it would be churn. CCPSectionNames likewise owns
 * the names of sections, and is called by the callers here rather than wrapped.
 */

var CCPContent = {};

/**
 * What the banner says when it has just gone away.
 *
 * Only the web component announces this: it holds a live region, and a reader who
 * was told "X is working on this case" is otherwise never told that stopped being
 * true. The legacy clients simply remove their stripe.
 */
CCPContent.ALL_CLEAR = "Nobody else is working on this case now";

/** The collapsed/expanded toggle, which all three surfaces carry. */
CCPContent.DETAILS_SHOW = "Show details";
CCPContent.DETAILS_HIDE = "Hide details";

/** @param {boolean} expanded @returns {string} */
CCPContent.detailsToggle = function (expanded) {
  return expanded ? CCPContent.DETAILS_HIDE : CCPContent.DETAILS_SHOW;
};

/** When the case is locked and presence has nobody to report. */
CCPContent.LOCKED_ONLY = "This case is locked";

/**
 * The one line a reader sees before opening anything.
 *
 * IT SAYS ONLY WHAT WE KNOW. The prototype's heading read "Case locked as 1 user
 * is editing with 2 users viewing". We can count people and name their sections;
 * we cannot say who is EDITING, or that anything is locked, because the presence
 * API reports neither — the lock below is a separate fact from a separate API.
 *
 * "OTHER" IS DROPPED WHEN THE COUNT INCLUDES US, because it would be a lie —
 * "2 other people" above a list that names you as one of them. The production
 * wording is the "other" branch, and it returns on its own once a client stops
 * counting the reader.
 *
 * THE LOCK LEADS. Presence is someone reading over your shoulder; the lock is the
 * case refusing to be written to. When both are true the lock goes first and
 * presence follows as a subordinate clause, because that is the order a reader
 * needs them in to decide what to do next. "currently" earns its place only in
 * that compound sentence, where it separates the standing state of the case from
 * who happens to be on it right now.
 *
 * `locked` IS ALWAYS FALSE ON THE LEGACY CLIENTS. Neither has a route to the
 * case-details API or a token for it, so neither can know. They pass nothing and
 * get the presence-only wording, which is the same sentence the web component
 * shows for an unlocked case — not a reduced version of it.
 *
 * @param {number} people how many people the roster holds
 * @param {boolean} includesSelf whether the reader is one of them
 * @param {boolean} [locked] whether the case is also locked
 * @returns {string}
 */
CCPContent.summary = function (people, includesSelf, locked) {
  var working = includesSelf
    ? people === 1
      ? "1 person is working on this case"
      : people + " people are working on this case"
    : people === 1
      ? "1 other person is working on this case"
      : people + " other people are working on this case";
  if (!locked) {
    return working;
  }
  if (!people) {
    return CCPContent.LOCKED_ONLY;
  }
  return (
    "This case is locked, and " +
    working
      .replace(" is working", " is currently working")
      .replace(" are working", " are currently working")
  );
};

/**
 * One application clause: "RCMS since 3.38pm on 8 September 2026", or just the
 * application when the API gave no time.
 *
 * EITHER SPELLING OF "NOTHING" IS ACCEPTED. CCPJoined.format says "" and the web
 * components' formatJoined says undefined; both are falsy and both land here, so
 * the test below pins that they produce the same clause.
 *
 * @param {string} appDisplayName
 * @param {string|undefined} since already formatted; falsy when there is none
 * @returns {string}
 */
CCPContent.appClause = function (appDisplayName, since) {
  return since ? appDisplayName + " since " + since : appDisplayName;
};

/**
 * Every application one person is in, as one clause.
 *
 * The API can give us a person with no application at all, in which case they are
 * simply here and we say no more than that — hence "" rather than a placeholder.
 *
 * @param {Array<{appDisplayName: string, timeEntered: (string|undefined)}>} apps
 * @param {function(string|undefined): (string|undefined)} format turns timeEntered
 *   into words, or into nothing when there is nothing to say
 * @returns {string}
 */
CCPContent.where = function (apps, format) {
  var clauses = [];
  var i;
  if (!apps) {
    return "";
  }
  for (i = 0; i < apps.length; i++) {
    clauses[clauses.length] = CCPContent.appClause(
      apps[i].appDisplayName,
      format(apps[i].timeEntered)
    );
  }
  return clauses.join(", ");
};

/**
 * One person, as a sentence.
 *
 *   "A Name is in the case review — RCMS since 3.38pm on 8 September 2026."
 *   "A Name is in a witness or victim."
 *   "A Name — RCMS since 3.38pm on 8 September 2026."
 *   "A Name is on this case."
 *
 * NAMING THE SECTION IS THE POINT. A case-wide session reports everyone anywhere
 * in the case, so "this case" was true of everybody and told the reader nothing;
 * the section is the difference between "someone is here" and "someone is on the
 * review". The fallback sentence is only for a person whose sections and
 * applications are both unknown.
 *
 * @param {string} name from CCPPeople.displayName
 * @param {string} sections from CCPSectionNames.describe, "" when none
 * @param {string} where from CCPContent.where, "" when none
 * @returns {string}
 */
CCPContent.personLine = function (name, sections, where) {
  return (
    name +
    (sections ? " is in " + sections : "") +
    (where ? " — " + where : "") +
    (!sections && !where ? " is on this case." : ".")
  );
};
