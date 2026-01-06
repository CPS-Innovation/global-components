import { makeConsole } from "../../logging/makeConsole";
import { DomMutationObserver } from "../browser/dom/DomMutationObserver";

type Styles = { [K in keyof CSSStyleDeclaration]?: string };

const { _debug } = makeConsole("outSystemsShimSubscribers");

const applyStylesFactory =
  ({ window }: { window: Window }) =>
  (styles: Styles) =>
  (element: HTMLElement) =>
    Object.entries(styles).forEach(([key, val]) => {
      if (window.getComputedStyle(element)[key] !== val) {
        _debug(`Applying ${key}=${val} to`, element);
        element.style[key] = val;
      }
    });

export const outSystemsShimSubscribers: DomMutationObserver[] = [
  ({ context, window, preview }) => {
    const applyStyles = applyStylesFactory(window);
    return {
      isActiveForContext: context.found && context.applyShim === "force-global-menu" && preview.found && !!preview.result.forceDcfHeader,
      subscriptions: [
        {
          cssSelector: "div[data-block='Common.TempHeader'], #b1-b2-GlobalNavigation",
          handler: applyStyles({ display: "none" }),
        },
        {
          cssSelector: "#b1-b2-Container_GlobalNav:not(:has(cps-global-header))",
          handler: (element: HTMLElement) => {
            const cpsHeader: HTMLCpsGlobalHeaderElement = window.document.createElement("cps-global-header");
            applyStyles({ marginBottom: "20px" })(cpsHeader);
            element.insertBefore(cpsHeader, element.firstChild);
            _debug("inserting our header");

            let ancestor = cpsHeader.parentElement;
            while (ancestor) {
              const computedStyle = window.getComputedStyle(ancestor);
              if (computedStyle.position === "sticky") {
                applyStyles({ position: "relative" })(ancestor);
              }
              ancestor = ancestor.parentElement;
            }
          },
        },
      ],
    };
  },
  ({ context, preview, window }) => {
    const applyStyles = applyStylesFactory(window);
    return {
      isActiveForContext: context.found && context.applyShim === "force-recent-cases" && !!preview.result?.myRecentCasesOnCases,
      subscriptions: [
        {
          cssSelector: "div[data-block='ReusableBlocks.CasesList']",
          handler: (element: HTMLElement) => {
            if (element.ownerDocument.querySelector("cps-global-recent-cases")) {
              return;
            }
            const cpsRecentCases: HTMLCpsGlobalRecentCasesElement = window.document.createElement("cps-global-recent-cases");
            applyStyles({ marginTop: "40px" })(cpsRecentCases);
            element.after(cpsRecentCases);
            return true;
          },
        },
      ],
    };
  },
  ({ context, preview, window }) => {
    return {
      isActiveForContext: context.found && context.applyShim === "force-recent-cases" && !!preview.result?.myRecentCasesOnHome,
      subscriptions: [
        {
          cssSelector: "div#\\$b5",
          handler: (element: HTMLElement) => {
            if (element.ownerDocument.querySelector("cps-global-recent-cases")) {
              return;
            }
            const clonedHr = document.querySelector("hr")?.cloneNode();
            if (clonedHr) {
              element.before(clonedHr);
            }

            const cpsRecentCases: HTMLCpsGlobalRecentCasesElement = window.document.createElement("cps-global-recent-cases");
            element.before(cpsRecentCases);
            return true;
          },
        },
      ],
    };
  },
];
