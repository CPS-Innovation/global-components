/**
 * IN-CODE SWITCHES, not config: one decision we have not finished making.
 *
 * allowContinue — whether the reader may carry on past the interruption, by the
 * "Continue anyway" button or by Escape. Off for now: the card blocks, and the way
 * on is "Go to case details". Kept as a switch rather than deleted because we are
 * not yet sure blocking is right.
 *
 * NEVER A TRAP. With nowhere to go (no CASE_LOCKING_CASE_DETAILS_URL, or no case
 * id to put in it) the button and Escape come back whatever this says — a modal
 * with no way out would leave the page unusable.
 */
export const INTERSTITIAL_OPTIONS = { allowContinue: false };
