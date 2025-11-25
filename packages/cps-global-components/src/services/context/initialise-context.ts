import { Config } from "cps-global-configuration";
import { FoundContext } from "./FoundContext";
import { replaceTagsInString } from "../../components/cps-global-menu/menu-config/helpers/replace-tags-in-string";
import { withLogging } from "../../logging/with-logging";
import { tryLocationMatch } from "./try-location-match";

const initialiseContextInternal = ({
  window: {
    location: { href },
  },
  config: { CONTEXTS },
}: {
  window: { location: Location };
  config: Pick<Config, "CONTEXTS">;
}): FoundContext => {
  for (let contextIndex = 0; contextIndex < CONTEXTS.length; contextIndex++) {
    const context = CONTEXTS[contextIndex];

    const match = tryLocationMatch(href, context.path);
    // Remember that our config file has the rules written from most-specific to least-specific
    //  so returning the first match found is what we want.
    if (!match) {
      continue;
    }

    const pathTags = match.groups || {};

    const cmsAuth = (context.cmsAuthFromStorageKey && (sessionStorage.getItem(context.cmsAuthFromStorageKey) || localStorage.getItem(context.cmsAuthFromStorageKey))) || "";

    return {
      ...context,
      // Special case: in development especially we can be running with an unknown port number. Our auth redirect endpoint
      //  would be dependant on that port number.  So lets do an immediate substitution of these tags, outside of the
      //  scope of our wider tags mechanism.
      msalRedirectUrl: replaceTagsInString(context.msalRedirectUrl, pathTags),
      found: true,
      pathTags,
      contextIndex,
      cmsAuth,
      currentHref: href,
    };
  }
  return { found: false };
};

export const initialiseContext = withLogging("initialiseContext", initialiseContextInternal);
