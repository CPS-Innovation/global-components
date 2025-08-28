import { withLogging } from "../logging/with-logging";
import { KnownState } from "../store/internal-state";

const shouldEnableAccessibilityMode = ({ flags }: Pick<KnownState, "flags">) => flags.isOverrideMode;

const shouldShowGovUkRebrand = ({ config }: Pick<KnownState, "config">) => !!config.SHOW_GOVUK_REBRAND;

const shouldShowMenu = ({ config: { SHOW_MENU, FEATURE_FLAG_ENABLE_MENU_GROUP }, auth }: Pick<KnownState, "config" | "auth">) =>
  !!SHOW_MENU && !!FEATURE_FLAG_ENABLE_MENU_GROUP && auth.isAuthed && auth.groups.includes(FEATURE_FLAG_ENABLE_MENU_GROUP);

const surveyLink = ({ config }: Pick<KnownState, "config">) => ({ showLink: !!config.SURVEY_LINK, url: config.SURVEY_LINK });

export const FLAGS = {
  shouldEnableAccessibilityMode: withLogging(shouldEnableAccessibilityMode),
  shouldShowGovUkRebrand: withLogging(shouldShowGovUkRebrand),
  shouldShowMenu: withLogging(shouldShowMenu),
  surveyLink: withLogging(surveyLink),
};

class Utils {
  static prefix = ">";

  // Arrow function captures the class as 'this'
  static log = (msg: string) => {
    console.log(`${Utils.prefix} ${msg}`);
  };
}

const { log } = Utils;
log("Works!"); // "> Works!"
