import { Config } from "cps-global-configuration";
import { FoundContext } from "./FoundContext";
import { replaceTagsInString } from "../../components/cps-global-menu/menu-config/helpers/replace-tags-in-string";
import { withLogging } from "../../logging/with-logging";
import { tryLocationMatch } from "./try-location-match";

const initialiseContextInternal = ({ window: { location }, config: { CONTEXTS } }: { window: Window; config: Pick<Config, "CONTEXTS"> }): FoundContext => {
  for (let contextIndex = 0; contextIndex < CONTEXTS.length; contextIndex++) {
    const context = CONTEXTS[contextIndex];
    for (const path of context.paths) {
      const match = tryLocationMatch(location, path);
      // Remember that our config file has the rules written from most-specific to least-specific
      //  so returning the first match found is what we want.
      if (match) {
        const pathTags = match.groups || {};

        // Special case: in development especially we can be running with an unknown port number. Our auth redirect endpoint
        //  would be dependant on that port number.  So lets do an immediate substitution of these tags, outside of the
        //  scope of our wider tags mechanism.
        context.msalRedirectUrl = replaceTagsInString(context.msalRedirectUrl, pathTags);
        return {
          ...context,
          found: true,
          pathTags,
          contextIndex,
        };
      }
    }
  }
  return { found: false };
};

export const initialiseContext = withLogging("initialiseContext", initialiseContextInternal);
