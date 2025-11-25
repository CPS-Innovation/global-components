import { Context } from "cps-global-configuration/dist/schema";
import { Tags } from "./Tags";

type MakeUndefinable<T> = {
  [K in keyof T]?: undefined;
};

type FoundContextFound = Context & {
  pathTags: Tags;
  contextIndex: number;
  cmsAuth: string;
  currentHref: string;
};

export type FoundContext =
  | ({
      found: true;
    } & FoundContextFound)
  | ({
      found: false;
    } & MakeUndefinable<FoundContextFound>);
