/* core/names.js — a person's name, from the address the presence API reports.
 * SHARED, MODE 5 FLOOR.
 *
 * The Watchdog names people by email address; the case lock names them by first
 * name and surname. Showing names everywhere means turning one into the other,
 * and the address is all we have.
 *
 * THE RULES COME FROM A SURVEY of every enabled member account in Entra
 * (2026-11-12, 10,271 accounts). 93.4% of addresses split as first.surname into
 * exactly the account's givenName and surname. What is left falls into shapes:
 *
 *   first.surname2       5.8%   trailing digits tell namesakes apart: dropped
 *   first.double-barrel  2.1%   hyphens kept, each piece capitalised
 *   mary-jane.surname    0.7%   the same, in the first name
 *   first.o'surname      8      apostrophe kept, the letter after it capitalised
 *   no dot at all        2.6%   functional and shared mailboxes
 *   a.<x>@cpsgovuk.onmicrosoft.com     admin accounts
 *   digits mid-name, underscores, several dots    rare, and mostly not people
 *
 * The first four parse. Everything else is not a name we can read off the
 * address, and gets the ADDRESS BACK, unchanged: a roster row that shows an
 * address is honest and still lets someone find the person; a guessed name that
 * is wrong is neither.
 *
 * WHAT THIS CANNOT DO. About 1.7% of real people use a different name in their
 * address than Entra holds — "chris" for Christopher, a maiden surname — and
 * they get the address's version. "mcdonald" becomes "Mcdonald": case lost in a
 * lower-case address cannot be recovered. Only a display name from the API would
 * fix either.
 */

var CCPNames = {};

/**
 * The domains whose addresses are people's names. Anything else — the tenant's
 * onmicrosoft.com admin accounts included — is shown as the address.
 */
CCPNames.STAFF_DOMAINS = ["cps.gov.uk", "attorneygeneral.gov.uk", "hmcpsi.gov.uk"];

// Letters, optionally joined by single hyphens or apostrophes: "mary-jane",
// "o'brien", "smith-jones". No leading, trailing or doubled joiners.
var CCP_NAMES_GIVEN = /^[A-Za-z]+(?:['-][A-Za-z]+)*$/;
// The same, with the namesake digits a surname may end in captured off.
var CCP_NAMES_SURNAME = /^([A-Za-z]+(?:['-][A-Za-z]+)*)\d*$/;

/**
 * Capitalise each run of letters, unless the address already gave it a mixed
 * case — "McDonald" as typed is better than anything we would make of it.
 *
 * @param {string} part
 * @returns {string}
 */
CCPNames.capitalise = function (part) {
  return part.replace(/[A-Za-z]+/g, function (run) {
    var mixed = run !== run.toLowerCase() && run !== run.toUpperCase();
    if (mixed) {
      return run;
    }
    return run.charAt(0).toUpperCase() + run.substring(1).toLowerCase();
  });
};

/**
 * The first name and surname an address spells, or null when it does not spell
 * one (see the shapes above).
 *
 * @param {string|undefined|null} email
 * @returns {{given: string, surname: string}|null}
 */
CCPNames.parse = function (email) {
  var address = String(email || "");
  var at = address.lastIndexOf("@");
  if (at < 1) {
    return null;
  }
  var domain = address.substring(at + 1).toLowerCase();
  var i;
  var staff = false;
  for (i = 0; i < CCPNames.STAFF_DOMAINS.length; i++) {
    if (CCPNames.STAFF_DOMAINS[i] === domain) {
      staff = true;
    }
  }
  if (!staff) {
    return null;
  }
  var parts = address.substring(0, at).split(".");
  if (parts.length !== 2) {
    return null;
  }
  var surname = CCP_NAMES_SURNAME.exec(parts[1]);
  if (!CCP_NAMES_GIVEN.test(parts[0]) || !surname) {
    return null;
  }
  return { given: CCPNames.capitalise(parts[0]), surname: CCPNames.capitalise(surname[1]) };
};

/**
 * What to call someone: "Mary-Jane O'Brien", or the address itself when it is
 * not a name. "" when there is no address.
 *
 * @param {string|undefined|null} email
 * @returns {string}
 */
CCPNames.displayName = function (email) {
  var name = CCPNames.parse(email);
  return name ? name.given + " " + name.surname : String(email || "");
};

// Letters only, lower-cased: "O'Brien-Smith" -> "obriensmith". What two spellings
// of one name have in common, whoever typed them.
CCPNames.letters = function (text) {
  return String(text || "").toLowerCase().replace(/[^a-z]/g, "");
};

/**
 * Is this address the person CMS names? For the case lock, which arrives as first
 * names and a surname rather than an address.
 *
 * The surname must agree, and the address's first name must be either the first
 * of CMS's first names or all of them run together — "mary-jane" matches
 * "Mary Jane" and "Mary-Jane". Compared on letters alone, so case, hyphens and
 * apostrophes cannot make one person look like two.
 *
 * FALSE WHEN UNSURE. An address that is not a name never matches, and nor does
 * anyone whose address uses a different name than CMS holds ("chris" for
 * Christopher). Calling two facts unrelated is the safe mistake; tying a lock to
 * the wrong person is not.
 *
 * @param {string|undefined|null} email
 * @param {string|undefined|null} firstNames
 * @param {string|undefined|null} surname
 * @returns {boolean}
 */
CCPNames.matches = function (email, firstNames, surname) {
  var name = CCPNames.parse(email);
  var given = CCPNames.letters(name ? name.given : "");
  var first = String(firstNames || "").split(" ")[0];
  if (!name || !given || CCPNames.letters(name.surname) !== CCPNames.letters(surname)) {
    return false;
  }
  return given === CCPNames.letters(first) || given === CCPNames.letters(firstNames);
};
