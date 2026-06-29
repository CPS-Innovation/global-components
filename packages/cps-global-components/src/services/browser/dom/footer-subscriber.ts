import { FEATURE_FLAGS } from "cps-global-configuration";
import { DomMutationObserver } from "./DomMutationObserver";

// Some host apps render the signed-in user's email as plain text in their
// footer (e2e tests assert against it). We hide the host footer, so scrape
// any email out of its text and forward it as a prop. The email may be
// injected asynchronously after the initial swap, so we also observe the
// hidden footer for later text changes.
const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const OBSERVED_MARKER = "cpsFooterEmailObserved";

// During a host SPA route transition the header is briefly hidden or
// zero-sized (display:none flash, parent collapsing, mid-paint state). The
// ResizeObserver faithfully fires with that tiny rect and — left unguarded —
// we'd write width:0 onto the footer, squashing the visible content inside
// it. Anything below this threshold is treated as transient: we keep the
// last good width until a real value arrives.
const MIN_REAL_HEADER_WIDTH_PX = 100;

// Tracks which cps-global-footer elements already have width-sync wired. The
// footer is re-anchored (not recreated) across SPA navigations, so once the
// permanent header-watcher is bound to a given footer instance we're done.
const widthSyncWired = new WeakSet<HTMLElement>();

const extractEmail = (el: Element) => el.textContent?.match(EMAIL_REGEX)?.[0];

// Wire the cps-global-footer wrapper's width to match the cps-global-header
// element currently in the DOM. Idempotent per cpsGlobalFooter instance.
//
// The original implementation set this up exactly once: a single query for
// cps-global-header at the moment the host footer arrived, then a one-time
// ResizeObserver bind. Two failure modes followed from that:
//   (a) Host pages where the footer arrived before the header — the query
//       returned null and no sync ever happened.
//   (b) Host apps that swap the header subtree during an SPA route change —
//       the ResizeObserver kept observing the old, detached header and the
//       footer stranded at its last value (often 0px after the transition
//       flash), squashing the link content.
//
// A permanent MutationObserver on the document body handles both: it detects
// header mount, unmount, and replacement, rebinding the ResizeObserver each
// time. The watcher cost is acceptable in this codebase (other subscribers
// already keep document-wide observers alive — see DOM-OBSERVATION.md).
const wireWidthSync = (cpsGlobalFooter: HTMLElement, doc: Document, win: Window) => {
  if (widthSyncWired.has(cpsGlobalFooter)) {
    return;
  }
  widthSyncWired.add(cpsGlobalFooter);

  let observedHeader: HTMLElement | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const syncWidth = () => {
    if (!observedHeader) {
      return;
    }
    const width = observedHeader.getBoundingClientRect().width;
    if (width < MIN_REAL_HEADER_WIDTH_PX) {
      return;
    }
    cpsGlobalFooter.style.width = `${width}px`;
    cpsGlobalFooter.style.marginLeft = "auto";
    cpsGlobalFooter.style.marginRight = "auto";
  };

  const checkAndBindHeader = () => {
    const header = doc.querySelector<HTMLElement>("cps-global-header");
    if (header === observedHeader) {
      return;
    }
    // Header changed (initial mount, swap during SPA nav, or unmount).
    // Disconnect any observer on the now-stale element and rebind.
    resizeObserver?.disconnect();
    resizeObserver = null;
    observedHeader = header;
    if (header) {
      resizeObserver = new ResizeObserver(syncWidth);
      resizeObserver.observe(header);
      syncWidth();
    }
  };

  // Permanent watcher for cps-global-header mount/unmount/swap. Cheap callback:
  // a single querySelector + reference compare; the observer/binding work only
  // runs when the header actually changes.
  new MutationObserver(checkAndBindHeader).observe(doc.body, { childList: true, subtree: true });

  // Viewport resize re-runs against whichever header is currently observed.
  win.addEventListener("resize", syncWidth);

  // Initial bind attempt — may bind now, or wait for the MutationObserver to
  // surface the header on a later mutation.
  checkAndBindHeader();
};

export const footerSubscriber: DomMutationObserver = ({ preview, flags, window }) => ({
  isActiveForContext: FEATURE_FLAGS.shouldShimFooter({ preview, flags }),
  subscriptions: [
    {
      cssSelector: "footer",
      handler: (element: HTMLElement) => {
        let cpsGlobalFooter = element.ownerDocument.querySelector<HTMLCpsGlobalFooterElement>("cps-global-footer");
        if (!cpsGlobalFooter) {
          cpsGlobalFooter = window.document.createElement("cps-global-footer");
        }
        // Re-anchor on every fire (not just first creation). React-style host
        // apps remount or relocate <footer> on SPA navigation and the existing
        // cps-global-footer can be left orphaned at its old position (commonly:
        // at the top of the new tree). From the top, the GDS footer's bleed
        // (box-shadow + clip-path) floods the viewport downward and swallows
        // the page content. Always pin it next to the matched host footer.
        if (cpsGlobalFooter.previousElementSibling !== element) {
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
        wireWidthSync(cpsGlobalFooter, element.ownerDocument, window);
        element.style.display = "none";
      },
    },
  ],
});
