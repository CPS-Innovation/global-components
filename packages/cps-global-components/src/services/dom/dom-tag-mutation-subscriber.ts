import { DomTags } from "cps-global-configuration/dist/schema";
import { UpdateTags } from "../../store/store";
import { DomMutationObserver } from "./DomMutationSubscriber";
import { _console } from "../../logging/_console";

export const domTagMutationSubscriber = ({ updateTags }: { updateTags: UpdateTags }): DomMutationObserver => {
  // With our approach of waiting until all required store items are ready, important to initialise this to
  //  at least an empty object - otherwise any observer of the store waiting for tags may never be ready.
  return ({ context }) => ({
    isActiveForContext: !!context.domTags?.length,
    subscriptions: (context.domTags || []).map(({ cssSelector }) => ({
      cssSelector,
      handler: element => {
        _console.debug("Dom observation handler firing for", element);
        const tags = extractTagsFromElement(element, context.domTags!);
        if (Object.keys(tags).length) {
          updateTags({ tags });
        }
      },
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
