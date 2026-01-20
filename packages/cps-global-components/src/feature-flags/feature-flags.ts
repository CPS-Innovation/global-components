import { Preview } from "cps-global-configuration";
import { State, StoredState } from "../store/store";
import { isUserInFeatureGroup } from "./is-user-in-feature-group";

const shouldShowCaseDetails = ({ preview, flags }: Pick<State, "preview" | "flags">) => !!preview.result?.caseMarkers || flags.isLocalDevelopment;

const shouldEnableAccessibilityMode = ({ preview, flags }: Pick<State, "preview" | "flags">) => !!(preview.result?.accessibility || flags.isLocalDevelopment);

const shouldShowGovUkRebrand = ({ preview }: Pick<State, "preview">): Preview["newHeader"] => preview.result?.newHeader;

const shouldShowRecentCases = ({ preview, flags }: Pick<State, "preview" | "flags">) => !!preview.result?.myRecentCasesOnHeader || flags.isLocalDevelopment;

const shouldShowMenu = ({ config, auth, context, cmsSessionHint, flags }: Pick<State, "config" | "context" | "cmsSessionHint" | "flags"> & Pick<StoredState, "auth">) => {
  if (cmsSessionHint.found && !cmsSessionHint.result.isProxySession && flags.environment === "prod") {
    // Currently, in prod, we only want the menu shown if we are connected to proxied CMS.
    // Design decision: if cmsSessionHint was not obtained then we continue to further
    //  logic i.e. fail-open. So if we are having problems with the hint then we will
    //  be optimistic and show the menu.
    return false;
  }

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

const surveyLink = ({ config }: Pick<State, "config">) => ({ showLink: !!config.SURVEY_LINK, url: config.SURVEY_LINK });

export const FEATURE_FLAGS = {
  shouldShowCaseDetails,
  shouldEnableAccessibilityMode,
  shouldShowGovUkRebrand,
  shouldShowRecentCases,
  shouldShowMenu,
  surveyLink,
};
