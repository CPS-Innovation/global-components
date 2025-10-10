import { withLogging } from "../logging/with-logging";
import { KnownState } from "../store/store";

const shouldEnableAccessibilityMode = ({ flags }: Pick<KnownState, "flags">) => flags.isOverrideMode;

const shouldShowGovUkRebrand = ({ config }: Pick<KnownState, "config">) => !!config.SHOW_GOVUK_REBRAND;

const shouldShowMenu = ({ config, auth, context }: Pick<KnownState, "config" | "auth" | "context">) => {
  if (context.found && context.showMenuOverride === "never-show-menu") {
    // Work management always need the menu to never appear on some pages
    return false;
  }

  if (context.found && context.showMenuOverride === "always-show-menu") {
    // Work management always need the menu on some pages
    return true;
  }

  return (
    // standard feature flag
    !!config.SHOW_MENU && !!config.FEATURE_FLAG_ENABLE_MENU_GROUP && auth.isAuthed && auth.groups.includes(config.FEATURE_FLAG_ENABLE_MENU_GROUP)
  );
};

const surveyLink = ({ config }: Pick<KnownState, "config">) => ({ showLink: !!config.SURVEY_LINK, url: config.SURVEY_LINK });

export const FEATURE_FLAGS = {
  shouldEnableAccessibilityMode: withLogging("shouldEnableAccessibilityMode", shouldEnableAccessibilityMode),
  shouldShowGovUkRebrand: withLogging("shouldShowGovUkRebrand", shouldShowGovUkRebrand),
  shouldShowMenu: withLogging("shouldShowMenu", shouldShowMenu),
  surveyLink: withLogging("surveyLink", surveyLink),
};
