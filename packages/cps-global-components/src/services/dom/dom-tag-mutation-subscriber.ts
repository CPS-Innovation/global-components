import { DomTags } from "cps-global-configuration/dist/schema";
import { Register } from "../../store/store";
import { DomMutationObserver } from "./DomMutationSubscriber";

export const domTagMutationSubscriber = ({ registerToStore }: { registerToStore: Register }): DomMutationObserver => {
  // With our approach of waiting until all required store items are ready, important to initialise this to
  //  at least an empty object - otherwise any observer of the store waiting for tags may never be ready.
  registerToStore({ tags: {} });
  return ({ context }) => ({
    isActiveForContext: !!context.domTags?.length,
    subscriptions: (context.domTags || []).map(({ cssSelector }) => ({
      cssSelector,
      handler: element => {
        const tags = extractTagsFromElement(element, context.domTags!);
        if (Object.keys(tags).length) {
          registerToStore({ tags });
        }
      },
      unbind: () => registerToStore({ tags: {} }),
    })),
  });
};

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
