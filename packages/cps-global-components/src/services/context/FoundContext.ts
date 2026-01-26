import { Context } from "cps-global-configuration";
import { Tags } from "../tags/Tags";

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
