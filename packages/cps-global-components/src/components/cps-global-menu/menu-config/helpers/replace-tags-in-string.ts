export const replaceTagsInString = (source: string, tags: { [key: string]: string }) =>
  Object.keys(tags).reduce((acc, curr) => acc.replace(new RegExp(`{${curr}}`, "g"), tags[curr]), source);
