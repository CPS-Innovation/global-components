import { Context } from "cps-global-configuration/dist/schema";
import { Tags } from "./Tags";

export type FoundContext =
  | (Context & {
      found: true;
      pathTags: Tags;
      contextIndex: number;
      msalRedirectUrl: string;
    })
  | {
      found: false;
      pathTags?: undefined;
      domTagDefinitions?: undefined;
      contextIndex?: undefined;
      msalRedirectUrl?: undefined;
    };
