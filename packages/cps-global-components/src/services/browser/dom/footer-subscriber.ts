import { FEATURE_FLAGS } from "cps-global-configuration";
import { DomMutationObserver } from "./DomMutationObserver";

// Some host apps render the signed-in user's email as plain text in their
// footer (e2e tests assert against it). We hide the host footer, so scrape
// any email out of its text and forward it as a prop. The email may be
// injected asynchronously after the initial swap, so we also observe the
// hidden footer for later text changes.
const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const OBSERVED_MARKER = "cpsFooterEmailObserved";
const WIDTH_OBSERVED_MARKER = "cpsFooterWidthObserved";

const extractEmail = (el: Element) => el.textContent?.match(EMAIL_REGEX)?.[0];

export const footerSubscriber: DomMutationObserver = ({ preview, flags, window }) => ({
  isActiveForContext: FEATURE_FLAGS.shouldShimFooter({ preview, flags }),
  subscriptions: [
    {
      cssSelector: "footer",
      handler: (element: HTMLElement) => {
        let cpsGlobalFooter = element.ownerDocument.querySelector<HTMLCpsGlobalFooterElement>("cps-global-footer");
        if (!cpsGlobalFooter) {
          cpsGlobalFooter = window.document.createElement("cps-global-footer");
          element.after(cpsGlobalFooter);
        }
        const applyEmail = () => {
          const email = extractEmail(element);
          if (email && cpsGlobalFooter!.userEmail !== email) {
            cpsGlobalFooter!.userEmail = email;
          }
        };
        applyEmail();
        if (!element.dataset[OBSERVED_MARKER]) {
          element.dataset[OBSERVED_MARKER] = "true";
          new MutationObserver(applyEmail).observe(element, {
            subtree: true,
            characterData: true,
            childList: true,
          });
        }
        // When the footer is shimmed in we cannot rely on the host page giving
        // us a width-establishing container. Mirror the cps-global-header's
        // measured width and centre the footer so its content column lines up
        // with the header's. Re-sync on header resize AND viewport resize: a
        // centred header at max-width doesn't change size when the viewport
        // does, but its on-screen position does.
        if (!cpsGlobalFooter.dataset[WIDTH_OBSERVED_MARKER]) {
          const header = element.ownerDocument.querySelector<HTMLElement>("cps-global-header");
          if (header) {
            cpsGlobalFooter.dataset[WIDTH_OBSERVED_MARKER] = "true";
            const syncWidth = () => {
              cpsGlobalFooter!.style.width = `${header.getBoundingClientRect().width}px`;
              cpsGlobalFooter!.style.marginLeft = "auto";
              cpsGlobalFooter!.style.marginRight = "auto";
            };
            syncWidth();
            new ResizeObserver(syncWidth).observe(header);
            window.addEventListener("resize", syncWidth);
          }
        }
        element.style.display = "none";
        // OS apps seem to bring footers in and out so keep this subscription alive
        // return true;
      },
    },
  ],
});
