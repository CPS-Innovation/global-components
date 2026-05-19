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

const shouldShowCaseDetails = ({ preview, flags }: FlagInputs) =>
  !!preview?.result?.caseMarkers || !!flags?.isLocalDevelopment;

const shouldEnableAccessibilityMode = ({ preview, flags }: FlagInputs) =>
  !!(preview?.result?.accessibility || flags?.isLocalDevelopment);

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
  shouldShowGovUkRebrand,
  shouldShowRecentCases,
  shouldShowMenu,
  surveyLink,
  reportIssueLink,
  shouldShowHomePageNotification,
  shouldUseFullPageMsalRedirect,
  shouldEnableCaseLocking,
};
