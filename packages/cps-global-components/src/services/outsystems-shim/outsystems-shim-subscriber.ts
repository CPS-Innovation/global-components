import { _console } from "../../logging/_console";
import { DomMutationObserver } from "../dom/DomMutationSubscriber";

type Styles = { [K in keyof CSSStyleDeclaration]?: string };

const applyStyles = (styles: Styles, element: HTMLElement) =>
  Object.entries(styles).forEach(([key, val]) => {
    if (element[key] !== val) {
      _console.debug("OutSystems shim", `Applying ${key}=${val} to`, element);
      element[key] = val;
    }
  });

export const outSystemsShimSubscriber =
  (): DomMutationObserver =>
  ({ context }) => ({
    isActiveForContext: context.found && !!context.applyOutSystemsShim,
    subscriptions: [
      {
        cssSelector: "header:not(cps-global-header header):not([class*='tabs']), .b1-BlueLine",
        handler: (element: HTMLElement) => applyStyles({ display: "none" }, element),
      },
      {
        cssSelector: ".main-content.ThemeGrid_Container.blue-line",
        handler: (element: HTMLElement) => applyStyles({ top: "0", flex: "0" }, element),
      },
    ],
  });

export const outSystemsShimSubscriberPreviousGeneration =
  ({ window: { document } }: { window: Window }): DomMutationObserver =>
  ({ context }) => ({
    isActiveForContext: context.found && !!context.applyOutSystemsShim,
    subscriptions: [
      {
        cssSelector: ["header:not(cps-global-header header):not([class*='tabs'])", ".b1-BlueLine", ".b1-PlaceholderNavigation"].join(","),
        handler: (element: HTMLElement) => applyStyles({ display: "none" }, element),
      },
      {
        cssSelector: "div[role='main']:not(:has(cps-global-header))",
        handler: (element: HTMLElement) => {
          const cpsHeader: HTMLCpsGlobalHeaderElement = document.createElement("cps-global-header");
          applyStyles({ top: "-50px", position: "relative", marginBottom: "20px" }, cpsHeader);

          element.insertBefore(cpsHeader, element.firstChild);

          _console.debug("OutSystems shim", "inserting our header");

          let ancestor = cpsHeader.parentElement;
          while (ancestor) {
            const computedStyle = window.getComputedStyle(ancestor);
            if (computedStyle.position === "sticky") {
              applyStyles({ position: "relative" }, ancestor);
            }
            ancestor = ancestor.parentElement;
          }
        },
      },
    ],
  });
