import { DomMutationObserver } from "../browser/dom/DomMutationObserver";
import { makeConsole } from "../../logging/makeConsole";

/**
 * A SHIM, standing in for the host app.
 *
 * The CaseReview app will eventually place its own <cps-region> to say which part
 * of the case a user is in. Until it does, this puts one there for it, so the
 * more-specific-region behaviour can be exercised end to end against a real app —
 * see applyDesired in initialise-case-locking.ts, where the case-wide fallback
 * stands down as soon as a region like this appears, and returns when it goes.
 *
 * It registers CASE_REVIEW, which is what being on that screen means. That is
 * different from the witness shim next to it, which deliberately registers the
 * CASE code: that one exists to trigger presence at all, not to name a section.
 *
 * DELETE THIS once the app team ship their own region. It is scaffolding, and the
 * only thing it should ever do is what they will do.
 */
const REGION_CODE = "case_review";
// cspell:disable-next-line
const URL_FRAGMENT = "/casereview";
// OutSystems wraps each screen in this container. Chosen because it is the app's
// own structural element rather than a piece of content that a design change would
// rename — the shim only needs somewhere stable to hang a marker.
const TARGET_SELECTOR = "div.active-screen";

const { _debug } = makeConsole("caseReviewAreaSubscriber");

export const createCaseReviewAreaSubscriber =
  (enabled: boolean): DomMutationObserver =>
  ({ context }) => {
    const isActiveForContext = enabled && !!context.currentHref?.toLowerCase().includes(URL_FRAGMENT);
    _debug("subscriber evaluated", { enabled, currentHref: context.currentHref, isActiveForContext });
    return {
      isActiveForContext,
      subscriptions: [
        {
          cssSelector: TARGET_SELECTOR,
          handler: (element: Element) => {
            const htmlEl = element as HTMLElement;
            if (htmlEl.querySelector(`cps-region[code="${REGION_CODE}"]`)) {
              _debug("cps-region already present — no-op");
              return;
            }
            htmlEl.insertAdjacentHTML("beforeend", `<cps-region code="${REGION_CODE}"></cps-region>`);
            _debug("case review screen matched — added cps-region", REGION_CODE);
          },
        },
      ],
    };
  };
