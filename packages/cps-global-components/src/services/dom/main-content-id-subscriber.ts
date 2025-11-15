import { mainContentId } from "./constants";
import { DomMutationObserver } from "./DomMutationSubscriber";

export const mainContentIdSubscriber: DomMutationObserver = ({ mergeTags }) => ({
  isActiveForContext: true,
  subscriptions: [
    {
      cssSelector: "main",
      handler: element => {
        if (element.ownerDocument.getElementById(mainContentId) !== null) {
          return true;
        }

        while (!element.id && element.parentElement && element.parentElement !== document.documentElement) {
          element = element.parentElement;
        }

        if (element.id) {
          mergeTags({ domTags: { mainContentId: element.id } });
        }

        return true;
      },
    },
  ],
});
