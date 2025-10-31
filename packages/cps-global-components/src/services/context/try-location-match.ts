export const tryLocationMatch = ({ href }: Location, pathToMatch: string) => {
  const match = href.match(new RegExp(pathToMatch, "i"));
  return match && { groups: match.groups || {} };
};
