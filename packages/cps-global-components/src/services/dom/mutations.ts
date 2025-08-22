import { DomTags } from "cps-global-configuration/dist/schema";

const extractTagsFromElement = (element: Element, domTags: DomTags[]) => {
  let tags: Record<string, string> = {};

  for (const domTag of domTags) {
    const foundElements = element.matches(domTag.cssSelector) ? [element] : [...element.querySelectorAll(domTag.cssSelector)];
    for (const foundElement of foundElements) {
      const match = foundElement.outerHTML.match(domTag.regex);
      tags = { ...tags, ...match?.groups };
    }
  }
  return tags;
};

const processMutations = (mutations: MutationRecord[], domTags: DomTags[]) => {
  let tags: Record<string, string> = {};

  for (const mutation of mutations) {
    const node = mutation.type === "characterData" ? mutation.target.parentElement : (mutation.target as Element);
    if (node) {
      tags = { ...tags, ...extractTagsFromElement(node, domTags) };
    }
  }

  return tags;
};

export const setupMutationObserver = (rootElement: Element, domTags: DomTags[], callback: (tags: Record<string, string>) => void) => {
  const observer = new MutationObserver(mutations => {
    const newTags = processMutations(mutations, domTags);
    if (Object.keys(newTags).length) {
      callback(newTags);
    }
  });

  observer.observe(rootElement, {
    attributes: true,
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Process initial DOM state
  const tags = extractTagsFromElement(rootElement, domTags);
  if (Object.keys(tags).length) {
    callback(tags);
  }

  return observer;
};
