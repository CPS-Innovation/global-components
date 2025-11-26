export const tryLocationMatch = (url: string, pathToMatch: string) => {
  const match = url.match(new RegExp(pathToMatch, "i"));
  return match && { groups: match.groups || {} };
};
