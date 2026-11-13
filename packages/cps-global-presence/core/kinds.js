/* core/kinds.js — the section kinds, as the presence API names them.
 *
 * These are the plain kinds. The CIN suffix ("CASE_CIN3") is applied on the wire
 * by CCPEnvironment, never here. The web components' config region codes are the
 * lower-case forms ("case", "victim_witness").
 *
 * Case-wide kinds (CASE, CASE_REVIEW) carry no subject; the others are scoped to
 * a person (VICTIM_WITNESS: the witness or victim; DEFENDANT: the party).
 */

var CCPKinds = {
  CASE: "CASE",
  CASE_REVIEW: "CASE_REVIEW",
  VICTIM_WITNESS: "VICTIM_WITNESS",
  DEFENDANT: "DEFENDANT"
};
