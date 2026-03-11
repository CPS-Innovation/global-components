export const replaceTagsInString = (source: string, tags: { [key: string]: string | number | null }) =>
  Object.keys(tags).reduce((acc, curr) => acc.replace(new RegExp(`{${curr}}`, "g"), String(tags[curr] === null ? "" : tags[curr])), source);
