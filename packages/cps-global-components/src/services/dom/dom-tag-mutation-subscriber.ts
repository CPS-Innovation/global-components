import { DomTagDefinitions } from "cps-global-configuration/dist/schema";
import { DomMutationObserver } from "./DomMutationObserver";
import { makeConsole } from "../../logging/makeConsole";
import { areAllTagsFound } from "../context/tag-helpers";

const { _debug } = makeConsole("domTagMutationSubscriber");

export const domTagMutationSubscriber: DomMutationObserver = ({ context, mergeTags }) => ({
  isActiveForContext: !!context.domTagDefinitions?.length,
  subscriptions: (context.domTagDefinitions || []).map(({ cssSelector, regex }) => ({
    cssSelector,
    handler: element => {
      const domTags = extractTagsFromElement(element, { cssSelector, regex });
      _debug("Dom observation handler firing for", element, " found ", domTags);
      const allDomTags = mergeTags({ domTags });

      // Let's say that if we have found all of our tags then lets stop, might
      //  be kinder on the app to not have mutation subscribers lurking around.
      // The alternative would be that we keep listening in case tags change
      //  for fresher versions, which could well eventually be a use case we'd
      //  encounter.
      return areAllTagsFound(regex, allDomTags);
    },
  })),
});

const extractTagsFromElement = (element: Element, { cssSelector, regex }: DomTagDefinitions) => {
  let tags: Record<string, string> = {};

  const foundElements = element.matches(cssSelector) ? [element] : [...element.querySelectorAll(cssSelector)];
  for (const foundElement of foundElements) {
    const match = foundElement.outerHTML.match(regex);
    tags = { ...tags, ...match?.groups };
  }

  return tags;
};
