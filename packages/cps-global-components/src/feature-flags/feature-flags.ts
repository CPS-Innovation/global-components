import { Preview } from "cps-global-configuration";
import { State, StoredState } from "../store/store";
import { isUserInFeatureGroup } from "./is-user-in-feature-group";

const shouldShowCaseDetails = ({ preview, flags }: Pick<State, "preview" | "flags">) => !!preview.result?.caseMarkers || flags.isLocalDevelopment;

const shouldEnableAccessibilityMode = ({ preview, flags }: Pick<State, "preview" | "flags">) => !!(preview.result?.accessibility || flags.isLocalDevelopment);

const shouldShowGovUkRebrand = ({ preview, config }: Pick<State, "preview" | "config">): Preview["newHeader"] =>
  preview.result?.newHeader ?? config.SHOW_HEADER_REBRAND;

const shouldShowRecentCases = ({ preview, flags }: Pick<State, "preview" | "flags">) => !!preview.result?.myRecentCasesOnHeader || flags.isLocalDevelopment;

const shouldShowMenu = ({ config, auth, authHint, context }: Pick<State, "config" | "context"> & Pick<StoredState, "auth" | "authHint">): boolean => {
  if (!config.SHOW_MENU) {
    return false;
  }
  if (!context.contextIds?.includes("materials-cwa")) {
    return true;
  }
  return isUserInFeatureGroup({ auth, authHint, config }, "FEATURE_FLAG_MENU_USERS");
};

const surveyLink = ({ config }: Pick<State, "config">) => ({ showLink: !!config.SURVEY_LINK, url: config.SURVEY_LINK });

const reportIssueLink = ({ config }: Pick<State, "config">) => ({ showLink: !!config.REPORT_ISSUE_LINK, url: config.REPORT_ISSUE_LINK });

const shouldShowHomePageNotification = ({ config, auth, authHint, preview }: Pick<State, "config" | "preview"> & Pick<StoredState, "auth" | "authHint">) =>
  !!preview.result?.homePageNotification || !isUserInFeatureGroup({ auth, authHint, config }, "FEATURE_FLAG_MENU_USERS");

export const FEATURE_FLAGS = {
  shouldShowCaseDetails,
  shouldEnableAccessibilityMode,
  shouldShowGovUkRebrand,
  shouldShowRecentCases,
  shouldShowMenu,
  surveyLink,
  reportIssueLink,
  shouldShowHomePageNotification,
};
