import { withLogging } from "../logging/with-logging";
import { KnownState } from "../store/store";
import { isUserInFeatureGroup } from "./is-user-in-feature-group";

const shouldEnableAccessibilityMode = ({ flags }: Pick<KnownState, "flags">) => flags.isOverrideMode;

const shouldShowGovUkRebrand = ({ config }: Pick<KnownState, "config">) => !!config.SHOW_GOVUK_REBRAND;

const shouldShowMenu = ({ config, auth, context }: Pick<KnownState, "config" | "auth" | "context">) => {
  if (!context.found) {
    // We have no context so do not have the information to make this determination
    return false;
  }

  if (context.showMenuOverride === "never-show-menu") {
    // Work management always need the menu to never appear on some pages
    return false;
  }

  if (context.showMenuOverride === "always-show-menu") {
    // Work management always need the menu on some pages
    return true;
  }

  return (
    // standard feature flag
    !!config.SHOW_MENU && isUserInFeatureGroup({ auth, config }, "FEATURE_FLAG_MENU_USERS")
  );
};

const surveyLink = ({ config }: Pick<KnownState, "config">) => ({ showLink: !!config.SURVEY_LINK, url: config.SURVEY_LINK });

export const FEATURE_FLAGS = {
  shouldEnableAccessibilityMode: withLogging("shouldEnableAccessibilityMode", shouldEnableAccessibilityMode),
  shouldShowGovUkRebrand: withLogging("shouldShowGovUkRebrand", shouldShowGovUkRebrand),
  shouldShowMenu: withLogging("shouldShowMenu", shouldShowMenu),
  surveyLink: withLogging("surveyLink", surveyLink),
};
