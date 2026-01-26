import { Tags } from "./Tags";

export const extractTags = <T>(source: Partial<T>, tagKeys: (keyof T)[]): { allTagsArePresent: boolean; tags: Tags } => {
  const fieldsInSource = Object.keys(source) as (keyof T)[];
  const allTagsArePresent = tagKeys.every(key => fieldsInSource.includes(key));

  const tags = tagKeys.reduce((acc, key) => ({ ...acc, [key]: String(source[key]) }), {});

  return { allTagsArePresent, tags };
};
