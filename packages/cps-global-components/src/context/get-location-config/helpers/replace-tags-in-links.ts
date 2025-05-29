import { MatchedPathMatcher, OnwardLinkDefinition, OnwardLinkDefinitions } from "../../LocationConfig";

const replaceTagsInString = (source: string, pathTags: MatchedPathMatcher["pathTags"]) =>
  Object.keys(pathTags).reduce((acc, curr) => acc.replace(new RegExp(`{${curr}}`, "g"), pathTags[curr]), source);

const replaceTags = (onwardLinkDefinition: OnwardLinkDefinition, pathTags: MatchedPathMatcher["pathTags"]) =>
  typeof onwardLinkDefinition === "string"
    ? replaceTagsInString(onwardLinkDefinition, pathTags)
    : { ...onwardLinkDefinition, link: replaceTagsInString(onwardLinkDefinition.link, pathTags) };

export const replaceTagsInLinks = (linkDefinitions: OnwardLinkDefinitions, pathTags: MatchedPathMatcher["pathTags"]) => {
  if (!pathTags || !Object.keys(pathTags).length) {
    return linkDefinitions;
  }
  return Object.keys(linkDefinitions).reduce((acc, curr) => {
    acc[curr] = replaceTags(linkDefinitions[curr], pathTags);
    return acc;
  }, {} as OnwardLinkDefinitions);
};
