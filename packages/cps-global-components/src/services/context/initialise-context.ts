import { Config } from "cps-global-configuration";
import { buildSanitizedAddress } from "./build-sanitized-address";
import { FoundContext } from "./FoundContext";

export const initialiseContext = ({ window, config: { CONTEXTS } }: { window: Window; config: Pick<Config, "CONTEXTS"> }): FoundContext => {
  const address = buildSanitizedAddress(window.location);

  for (let contextIndex = 0; contextIndex < CONTEXTS.length; contextIndex++) {
    const context = CONTEXTS[contextIndex];
    for (const path of context.paths) {
      const match = address.match(new RegExp(path, "i"));
      if (match) {
        // Remember that our config file has the rules written from most-specific to least-specific
        //  so returning the first match found is what we want.
        return {
          ...context,
          found: true,
          pathTags: match.groups || {},
          contextIndex,
        };
      }
    }
  }
  return { found: false };
};
