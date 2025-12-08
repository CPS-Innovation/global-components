import { makeConsole } from "../../logging/makeConsole";
import { FoundContext } from "../context/FoundContext";
import { DomMutationObserver } from "../dom/DomMutationObserver";

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

const isActiveForApp = (context: FoundContext) => context.found && !!context.applyOutSystemsShim;

export const outSystemsShimSubscribers: DomMutationObserver[] = [
  ({ context, window }) => {
    const applyStyles = applyStylesFactory(window);
    return {
      isActiveForContext: isActiveForApp(context),
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
];
