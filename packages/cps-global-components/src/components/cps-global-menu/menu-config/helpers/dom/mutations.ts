import { DomTags } from "cps-global-configuration/dist/schema";
import { cacheDomTags } from "./tags";

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
    if (mutation.type !== "childList") continue;
    for (const node of mutation.addedNodes) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
      tags = { ...tags, ...extractTagsFromElement(node as Element, domTags) };
    }
  }

  return tags;
};

export const setupMutationObserver = (rootElement: Element, domTags: DomTags[], callback: () => void) => {
  const observer = new MutationObserver(mutations => {
    const newTags = processMutations(mutations, domTags);
    cacheDomTags(newTags);
    if (Object.keys(newTags).length) {
      callback();
    }
  });

  observer.observe(rootElement, {
    childList: true,
    subtree: true,
  });

  // Process initial DOM state
  const tags = extractTagsFromElement(rootElement, domTags);
  cacheDomTags(tags);

  return observer;
};
