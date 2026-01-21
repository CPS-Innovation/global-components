export const replaceTagsInString = (source: string, tags: { [key: string]: string | number }) =>
  Object.keys(tags).reduce((acc, curr) => acc.replace(new RegExp(`{${curr}}`, "g"), String(tags[curr])), source);
