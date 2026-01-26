import { Tags } from "./Tags";

const extractNamedGroups = (regexString: string): string[] => {
  // Pattern to match named groups: (?<name>) or (?'name') syntax
  const namedGroupPattern = /\(\?<([^>]+)>|\(\?'([^']+)'/g;
  const groups: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = namedGroupPattern.exec(regexString)) !== null) {
    // match[1] for (?<name>) syntax, match[2] for (?'name') syntax
    groups.push(match[1] || match[2]);
  }

  return groups;
};

const getNamedGroups = (...regexes: string[]) => [...new Set(regexes.flatMap(regex => extractNamedGroups(regex)))];

export const haveFoundAllTagsInRegex = (regex: string, tags: Tags) => {
  const tagKeys = getNamedGroups(regex);
  return tagKeys.every(key => Object.keys(tags).includes(key));
};
