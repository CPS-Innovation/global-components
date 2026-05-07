import { Preview } from "cps-global-configuration";
import { State, StoredState } from "../store/store";
import { getFeatureFlagAssignment } from "./get-feature-flag-assignment";

const shouldShowCaseDetails = ({ preview, flags }: Pick<State, "preview" | "flags">) => !!preview.result?.caseMarkers || flags.isLocalDevelopment;

const shouldEnableAccessibilityMode = ({ preview, flags }: Pick<State, "preview" | "flags">) => !!(preview.result?.accessibility || flags.isLocalDevelopment);

const shouldShowGovUkRebrand = ({ preview, config }: Pick<State, "preview" | "config">): Preview["newHeader"] => preview.result?.newHeader ?? config.SHOW_HEADER_REBRAND;

const shouldShowRecentCases = ({ preview, flags }: Pick<State, "preview" | "flags">) => !!preview.result?.myRecentCasesOnHeader || flags.isLocalDevelopment;

const shouldShowMenu = ({ config, auth, authHint, context }: Pick<State, "config" | "context"> & Pick<StoredState, "auth" | "authHint">): boolean => {
  if (!config.SHOW_MENU) {
    return false;
  }
  if (!context.contextIds?.includes("materials-cwa")) {
    return true;
  }
  return getFeatureFlagAssignment({ auth, authHint, config }, "FEATURE_FLAG_MENU_USERS").result;
};

const surveyLink = ({ config }: Pick<State, "config">) => ({ showLink: !!config.SURVEY_LINK, url: config.SURVEY_LINK });

const reportIssueLink = ({ config }: Pick<State, "config">) => ({ showLink: !!config.REPORT_ISSUE_LINK, url: config.REPORT_ISSUE_LINK });

const shouldShowHomePageNotification = ({ config, auth, authHint, preview }: Pick<State, "config" | "preview"> & Pick<StoredState, "auth" | "authHint">) =>
  !!preview.result?.homePageNotification || !getFeatureFlagAssignment({ auth, authHint, config }, "FEATURE_FLAG_MENU_USERS").result;

// Whether to use full-page MSAL redirect (loginRedirect) instead of the
// silent / popup cascade. Two paths to opt-in:
//   - preview override (preview.result.useFullPageMsalRedirect) — for ad-hoc
//     testing without a config push
//   - eligibility (and any variant bucketing) under FEATURE_FLAG_USE_MSAL_FULL_REDIRECT_USERS
// Evaluated by the host before initialising auth; result is passed down to
// cps-global-auth as a plain boolean so the auth library stays agnostic of
// state shape.
const shouldUseFullPageMsalRedirect = ({ config, preview, auth, authHint }: Pick<State, "config" | "preview"> & Pick<StoredState, "auth" | "authHint">): boolean =>
  !!preview.result?.useFullPageMsalRedirect || getFeatureFlagAssignment({ auth, authHint, config }, "FEATURE_FLAG_USE_MSAL_FULL_REDIRECT_USERS").result;

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
};
