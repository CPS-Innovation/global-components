import { _console } from "../../logging/_console";
import { DomMutationObserver } from "../dom/DomMutationSubscriber";

type Styles = { [K in keyof CSSStyleDeclaration]?: string };

const applyStylesFactory =
  ({ window }: { window: Window }) =>
  (styles: Styles) =>
  (element: HTMLElement) =>
    Object.entries(styles).forEach(([key, val]) => {
      if (window.getComputedStyle(element)[key] !== val) {
        _console.debug("OutSystems shim", `Applying ${key}=${val} to`, element);
        element.style[key] = val;
      }
    });

export const outSystemsShimSubscriber = ({ window }: { window: Window }): DomMutationObserver => {
  // Beware: if this logic is ever changed then be sure to check that everything works when navigating around
  //  the apps via the menu.  The OS UI behaviour is different between when using the OS-specific login pages and
  //  when navigating around the apps with the menu.  Just because the shim does what is expected after logging-in
  //  via the specific login pages doesn't mean it works when OS apps are arrived at when navigating around an
  //  environment.
  const applyStyles = applyStylesFactory(window);
  return ({ context }) => ({
    isActiveForContext: context.found && !!context.applyOutSystemsShim,
    subscriptions: [
      {
        cssSelector:
          // work management
          "header:not(cps-global-header header):not([class*='tabs']), #b1-BlueLine, #b1-PlaceholderNavigation" +
          // case review
          ", #$b3 #b3-header2",
        handler: applyStyles({ display: "none" }),
      },
      {
        cssSelector:
          // work management
          "div.main-content.ThemeGrid_Container.blue-line[role='main']",
        handler: applyStyles({ top: "0", flex: "0", position: "relative" }),
      },
      {
        cssSelector:
          // work management
          "div.main-content.ThemeGrid_Container.blue-line[role='main']:not(:has(cps-global-header))",
        handler: (element: HTMLElement) => {
          const cpsHeader: HTMLCpsGlobalHeaderElement = window.document.createElement("cps-global-header");
          applyStyles({ marginBottom: "20px" })(cpsHeader);
          element.insertBefore(cpsHeader, element.firstChild);
          _console.debug("OutSystems shim", "inserting our header");

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
      {
        cssSelector:
          // case review
          "#$b3:not(cps-global-header header)",
        handler: (element: HTMLElement) => {
          const cpsHeader: HTMLCpsGlobalHeaderElement = window.document.createElement("cps-global-header");
          applyStyles({ maxWidth: "1280px" })(cpsHeader);
          element.insertBefore(cpsHeader, element.firstChild);
          _console.debug("OutSystems shim", "inserting our header");
        },
      },
    ],
  });
};
