import { Context } from "cps-global-configuration/dist/schema";

export const findContext = (contextArr: Context[], address: string) => {
  for (const { paths, contexts } of contextArr) {
    for (const path of paths) {
      const match = address.match(path);
      if (match) {
        return { found: true, contexts, tags: match.groups || {} };
      }
    }
  }
  return { found: false, contexts: undefined, tags: undefined };
};
