import { Context } from "./Config";
import { Tags } from "./Tags";

// The runtime-resolved context the user is in: which CONTEXTS entry from
// config.json matched the current URL, plus the runtime data extracted while
// matching (path tags, current href, CMS auth from OS storage).
//
// The discriminated `found` shape lets consumers branch with type-narrowing
// rather than smattering of `?.` chains.

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
