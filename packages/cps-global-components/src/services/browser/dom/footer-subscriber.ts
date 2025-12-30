import { DomMutationObserver } from "./DomMutationObserver";

export const footerSubscriber: DomMutationObserver = ({ preview, window }) => ({
  isActiveForContext: !!preview.result?.footer,
  subscriptions: [
    {
      cssSelector: "footer",
      handler: (element: HTMLElement) => {
        if (element.ownerDocument.querySelector("cps-global-footer")) {
          return true;
        }
        const cpsGlobalFooter: HTMLCpsGlobalFooterElement = window.document.createElement("cps-global-footer");
        element.after(cpsGlobalFooter);
        element.style.display = "none";
        return true;
      },
    },
  ],
});
