import type { AuthHint } from "../AuthHint";
import type { AuthResult } from "../AuthResult";
import type { ApplicationFlags } from "../ApplicationFlags";
import type { Config } from "../Config";
import type { FoundContext } from "../FoundContext";
import type { Preview } from "../Preview";
import type { Result } from "../Result";
import { getFeatureFlagAssignment } from "./get-feature-flag-assignment";

// Parameter shapes used by individual flag predicates. Plain object types
// (not Pick<State, ...>) so this module stays self-contained — usable from
// the host bundle, the handover bundle, and tests without dragging in the
// host's store types.
//
// Optionality: `auth`, `authHint`, `preview` may not have resolved yet
// (handover-bundle entry, very early startup). Predicates handle undefined
// gracefully via `?.` chains and the resolveAuth fallback inside
// getFeatureFlagAssignment.

type FlagInputs = {
  config: Config;
  preview?: Result<Preview>;
  flags?: ApplicationFlags;
  context?: FoundContext;
  auth?: AuthResult;
  authHint?: Result<AuthHint>;
};

// Resolution order: a preview value always wins (including "off", the explicit
// "force hidden" override colleagues use to demo prod-like in QA), then the
// per-env config, then the local-dev default. "off" collapses to undefined so
// the menu's truthiness gate hides the panel rather than rendering layout "a".
const shouldShowCaseDetails = ({ preview, config, flags }: FlagInputs): "a" | "b" | undefined => {
  const resolved = preview?.result?.caseMarkers ?? config.SHOW_CASE_DETAILS ?? (flags?.isLocalDevelopment ? "a" : undefined);
  return resolved === "off" ? undefined : resolved;
};

// Gates the footer "Settings" link and the low-contrast background subscriber that
// the settings page drives — the two must move together, or a user gets a link to a
// control that silently does nothing. FEATURE_FLAG_ACCESSIBILITY_MODE_USERS carries the
// env-wide switch (generallyAvailable, on across pre-prod) plus group/ad-hoc enrolment
// for piloting in prod; it ORs with the per-user preview opt-in and the local-dev default.
//
// Note for the subscriber call site: the group/ad-hoc paths need an identity, and on a
// cold first load there is neither `auth` nor `authHint` yet, so those users get no paint
// until the next page load. generallyAvailable and preview need no identity at all.
const shouldEnableAccessibilityMode = ({ config, preview, flags, auth, authHint }: FlagInputs) =>
  !!preview?.result?.accessibility ||
  !!flags?.isLocalDevelopment ||
  getFeatureFlagAssignment({ auth, authHint, config }, "FEATURE_FLAG_ACCESSIBILITY_MODE_USERS").result;

// Used by the DOM subscriber that swaps host <footer>s for cps-global-footer.
// FOOTER_SHIM_ENABLED is the env-config GA gate (on for everyone); it ORs with
// the per-user preview opt-in and the local-dev default, so flipping it to false
// reverts to preview opt-ins + local dev only — the pre-GA behaviour — without a
// code change.
const shouldShimFooter = ({ config, preview, flags }: Pick<FlagInputs, "config" | "preview" | "flags">) =>
  !!config.FOOTER_SHIM_ENABLED || !!preview?.result?.footer || !!flags?.isLocalDevelopment;

const shouldShowGovUkRebrand = ({ preview, config }: FlagInputs): Preview["newHeader"] =>
  preview?.result?.newHeader ?? config.SHOW_HEADER_REBRAND;

const shouldShowRecentCases = ({ preview, flags }: FlagInputs) =>
  !!preview?.result?.myRecentCasesOnHeader || !!flags?.isLocalDevelopment;

const shouldShowMenu = ({ config, auth, authHint, context }: FlagInputs): boolean => {
  if (!config.SHOW_MENU) {
    return false;
  }
  if (!context?.contextIds?.includes("materials-cwa")) {
    return true;
  }
  return getFeatureFlagAssignment({ auth, authHint, config }, "FEATURE_FLAG_MENU_USERS").result;
};

const surveyLink = ({ config }: FlagInputs) => ({ showLink: !!config.SURVEY_LINK, url: config.SURVEY_LINK });

const reportIssueLink = ({ config }: FlagInputs) => ({ showLink: !!config.REPORT_ISSUE_LINK, url: config.REPORT_ISSUE_LINK });

const accessibilityStatementLink = ({ config }: FlagInputs) => ({
  showLink: !!config.ACCESSIBILITY_STATEMENT_URL,
  url: config.ACCESSIBILITY_STATEMENT_URL,
});

const shouldShowHomePageNotification = ({ config, auth, authHint, preview }: FlagInputs) =>
  !!preview?.result?.homePageNotification ||
  !getFeatureFlagAssignment({ auth, authHint, config }, "FEATURE_FLAG_MENU_USERS").result;

// Whether to use full-page MSAL redirect (loginRedirect) instead of the
// silent / popup cascade. Two paths to opt-in:
//   - preview override (preview.result.useFullPageMsalRedirect) — for ad-hoc
//     testing without a config push
//   - eligibility (and any variant bucketing) under FEATURE_FLAG_USE_MSAL_FULL_REDIRECT_USERS
// Evaluated by the host before initialising auth, and by the handover bundle
// before doing any preemptive AD validation on the OS handover paths.
const shouldUseFullPageMsalRedirect = ({ config, preview, auth, authHint }: FlagInputs): boolean =>
  !!preview?.result?.useFullPageMsalRedirect ||
  getFeatureFlagAssignment({ auth, authHint, config }, "FEATURE_FLAG_USE_MSAL_FULL_REDIRECT_USERS").result;

const shouldEnableCaseLocking = ({ config, preview, auth, authHint }: FlagInputs) =>
  !!config.CASE_LOCKING_API_URL &&
  (!!preview?.result?.caseLocking ||
    getFeatureFlagAssignment({ auth, authHint, config }, "FEATURE_FLAG_CASE_LOCKING_USERS").result);

export const FEATURE_FLAGS = {
  shouldShowCaseDetails,
  shouldEnableAccessibilityMode,
  shouldShimFooter,
  shouldShowGovUkRebrand,
  shouldShowRecentCases,
  shouldShowMenu,
  surveyLink,
  reportIssueLink,
  accessibilityStatementLink,
  shouldShowHomePageNotification,
  shouldUseFullPageMsalRedirect,
  shouldEnableCaseLocking,
};
