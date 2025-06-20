import { DomTags } from "cps-global-configuration/dist/schema";
import { cacheDomTags } from "./tags";

const processMutations = ([mutation, ...rest]: MutationRecord[], domTags: DomTags[]): number =>
  !mutation || mutation.type !== "childList" ? 0 : processMutationNodes([...mutation.addedNodes], domTags) + processMutations(rest, domTags);

const processMutationNodes = ([node, ...rest]: Node[], domTags: DomTags[]): number =>
  !node || node.nodeType !== Node.ELEMENT_NODE ? 0 : tryExtractDomTags(node as Element, domTags) + processMutationNodes(rest, domTags);

const tryExtractDomTags = (element: Element, domTags: DomTags[]) => {
  const tags = processDomTags(element, domTags);
  cacheDomTags(tags);
  return Object.keys(tags).length;
};

const processDomTags = (element: Element, [domTag, ...rest]: DomTags[]): Record<string, string> => {
  if (!domTag) {
    return {};
  }

  const foundElements = element.matches(domTag.cssSelector) ? [element] : [...element.querySelectorAll(domTag.cssSelector)];
  return {
    ...processFoundElements(foundElements, domTag.regex),
    ...processDomTags(element, rest),
  };
};

const processFoundElements = ([foundElement, ...rest]: Element[], regex: string): Record<string, string> => {
  if (!foundElement) {
    return {};
  }

  const match = foundElement.outerHTML.match(regex);
  return {
    ...match?.groups,
    ...processFoundElements(rest, regex),
  };
};

export const setupMutationObserver = (rootElement: Element, domTags: DomTags[], callback: () => void) => {
  // We are being asked to find tags in any new DOM elements
  const observer = new MutationObserver(mutations => {
    const foundTagCount = processMutations(mutations, domTags);
    if (foundTagCount) {
      // We have found at least one tag in the new DOM elements, let's inform our subscriber
      callback();
    }
  });

  observer.observe(rootElement, {
    childList: true,
    subtree: true,
  });

  // Run the logic
  tryExtractDomTags(window.document.body, domTags);

  return observer;
};
