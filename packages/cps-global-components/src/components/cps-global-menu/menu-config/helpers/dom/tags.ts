let cachedDomTags: Record<string, string> = undefined;

export const cacheDomTags = (tags: Record<string, string>) => {
  cachedDomTags = { ...cachedDomTags, ...tags };
};

export const resetDomTags = () => (cachedDomTags = undefined);

export const getDomTags = () => cachedDomTags;
