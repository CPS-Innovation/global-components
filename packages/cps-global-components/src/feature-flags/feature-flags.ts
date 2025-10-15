import { withLogging } from "../logging/with-logging";
import { KnownState } from "../store/store";
import { isUserInFeatureGroup } from "./is-user-in-feature-group";

const shouldEnableAccessibilityMode = ({ flags }: Pick<KnownState, "flags">) => flags.isOverrideMode;

const shouldShowGovUkRebrand = ({ config }: Pick<KnownState, "config">) => !!config.SHOW_GOVUK_REBRAND;

const shouldShowMenu = ({ config, auth, context }: Pick<KnownState, "config" | "auth" | "context">) => {
  if (context.found) {
    if (context.showMenuOverride === "never-show-menu") {
      // Work management always need the menu to never appear on some pages
      return false;
    }

    if (context.showMenuOverride === "always-show-menu") {
      // Work management always need the menu on some pages
      return true;
    }
  }

  // Note: at this point we are saying it is acceptable to be executing this code without
  //  a context i.e. context.found === false. This is subject to being reassessed because
  //  the menuConfig code is a related concern and a refactor may be warranted.

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
