import { Preview } from "cps-global-configuration";
import { State, StoredState } from "../store/store";
import { isUserInFeatureGroup } from "./is-user-in-feature-group";

const shouldShowCaseDetails = ({ preview, flags }: Pick<State, "preview" | "flags">) => !!preview.result?.caseMarkers || flags.isLocalDevelopment;

const shouldEnableAccessibilityMode = ({ preview, flags }: Pick<State, "preview" | "flags">) => !!(preview.result?.accessibility || flags.isLocalDevelopment);

const shouldShowGovUkRebrand = ({ preview }: Pick<State, "preview">): Preview["newHeader"] => preview.result?.newHeader;

const shouldShowRecentCases = ({ preview, flags }: Pick<State, "preview" | "flags">) => !!preview.result?.myRecentCasesOnHeader || flags.isLocalDevelopment;

const shouldShowMenu = ({ config, auth, context, flags }: Pick<State, "config" | "context" | "flags"> & Pick<StoredState, "auth">) => {
  if (auth?.isAuthed && auth.username?.toLocaleLowerCase().startsWith("stefan.stachow")) {
    return "show-hint";
  } else if (!config.SHOW_MENU) {
    return "hide-menu";
  } else if (!context.contextIds?.includes("materials")) {
    return "show-menu";
  } else if (isUserInFeatureGroup({ auth, config }, "FEATURE_FLAG_MENU_USERS")) {
    return "show-menu";
  } else if (flags.environment === "test") {
    return "show-hint";
  } else {
    return "hide-menu";
  }
};

const shouldShowOpenCaseInCms = ({ preview, flags }: Pick<State, "preview" | "flags">) => !!preview.result?.openCaseInCms || flags.isLocalDevelopment;

const surveyLink = ({ config }: Pick<State, "config">) => ({ showLink: !!config.SURVEY_LINK, url: config.SURVEY_LINK });

const reportIssueLink = ({ config }: Pick<State, "config">) => ({ showLink: !!config.REPORT_ISSUE_LINK, url: config.REPORT_ISSUE_LINK });

export const FEATURE_FLAGS = {
  shouldShowCaseDetails,
  shouldEnableAccessibilityMode,
  shouldShowGovUkRebrand,
  shouldShowRecentCases,
  shouldShowMenu,
  shouldShowOpenCaseInCms,
  surveyLink,
  reportIssueLink,
};
