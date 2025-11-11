import { domTagDefinitions } from "cps-global-configuration/dist/schema";
import { MergeTags } from "../../store/store";
import { DomMutationObserver } from "./DomMutationSubscriber";
import { _console } from "../../logging/_console";

export const domTagMutationSubscriber = ({ mergeTags }: { mergeTags: MergeTags }): DomMutationObserver => {
  return ({ context }) => ({
    isActiveForContext: !!context.domTagDefinitions?.length,
    subscriptions: (context.domTagDefinitions || []).map(({ cssSelector }) => ({
      cssSelector,
      handler: element => {
        _console.debug("Dom observation handler firing for", element);
        const domTags = extractTagsFromElement(element, context.domTagDefinitions!);
        mergeTags({ domTags });
      },
    })),
  });
};

const extractTagsFromElement = (element: Element, domTagDefinitions: domTagDefinitions[]) => {
  let tags: Record<string, string> = {};

  for (const domTag of domTagDefinitions) {
    const foundElements = element.matches(domTag.cssSelector) ? [element] : [...element.querySelectorAll(domTag.cssSelector)];
    for (const foundElement of foundElements) {
      const match = foundElement.outerHTML.match(domTag.regex);
      tags = { ...tags, ...match?.groups };
    }
  }
  return tags;
};
