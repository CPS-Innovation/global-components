import { Context } from "cps-global-configuration/dist/schema";
import { buildSanitizedAddress } from "./build-sanitized-address";
import { Tags } from "./Tags";

export type FoundContext =
  | (Context & {
      found: true;
      tags: Tags;
      contextIndex: number;
      msalRedirectUrl: string;
    })
  | { found: false; domTags?: undefined; contextIndex?: undefined; msalRedirectUrl?: undefined };

export const findContext = (contextArr: Context[], window: Window): FoundContext => {
  const address = buildSanitizedAddress(window.location);

  for (let contextIndex = 0; contextIndex < contextArr.length; contextIndex++) {
    const context = contextArr[contextIndex];
    for (const path of context.paths) {
      const match = address.match(new RegExp(path, "i"));
      if (match) {
        // Remember that our config file has the rules written from most-specific to least-specific
        //  so returning the first match found is what we want.
        return {
          ...context,
          found: true,
          tags: match.groups || {},
          contextIndex,
        };
      }
    }
  }
  return { found: false };
};
