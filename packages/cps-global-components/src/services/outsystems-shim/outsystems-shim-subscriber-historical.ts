import { makeConsole } from "../../logging/makeConsole";
import { FoundContext } from "../context/FoundContext";
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

const isActiveForApp = (context: FoundContext, appPath: string) => context.found && !!context.applyOutSystemsShim && new URL(context.path).pathname.includes(appPath);

// Beware: if this logic is ever changed then be sure to check that everything works when navigating around
//  the apps via the menu.  The OS UI behaviour is different between when using the OS-specific login pages and
//  when navigating around the apps with the menu.  Just because the shim does what is expected after logging-in
//  via the specific login pages doesn't mean it works when OS apps are arrived at when navigating around an
//  environment.
export const outSystemsShimSubscribersHistorical: DomMutationObserver[] = [
  ({ context, window }) => {
    const applyStyles = applyStylesFactory(window);
    return {
      isActiveForContext: isActiveForApp(context, "/WorkManagementApp/"),
      subscriptions: [
        // {
        //   cssSelector: "header:not(cps-global-header header):not([class*='tabs']), #b1-BlueLine, #b1-PlaceholderNavigation",
        //   handler: applyStyles({ display: "none" }),
        // },
        {
          cssSelector: "header.header, #b1-BlueLine",
          handler: applyStyles({ display: "none" }),
        },
        {
          cssSelector: "div.main-content.ThemeGrid_Container.blue-line[role='main']",
          handler: applyStyles({ top: "0", flex: "0", position: "relative" }),
        },
        {
          cssSelector: "cps-global-header",
          handler: (element: HTMLElement) => {
            applyStyles({ marginBottom: "20px" })(element);

            while (element) {
              const computedStyle = window.getComputedStyle(element);
              if (computedStyle.position === "sticky") {
                applyStyles({ position: "relative" })(element);
              }

              if (!element.parentElement) {
                break;
              }
              element = element.parentElement;
            }
          },
        },
        {
          cssSelector: ".alerts-container",
          handler: applyStyles({ display: "none" }),
        },
        // {
        //   cssSelector: "div.main-content.ThemeGrid_Container.blue-line[role='main']:not(:has(cps-global-header))",
        //   handler: (element: HTMLElement) => {
        //     const cpsHeader: HTMLCpsGlobalHeaderElement = window.document.createElement("cps-global-header");
        //     applyStyles({ marginBottom: "20px" })(cpsHeader);
        //     element.insertBefore(cpsHeader, element.firstChild);
        //     _debug("inserting our header");

        //     let ancestor = cpsHeader.parentElement;
        //     while (ancestor) {
        //       const computedStyle = window.getComputedStyle(ancestor);
        //       if (computedStyle.position === "sticky") {
        //         applyStyles({ position: "relative" })(ancestor);
        //       }
        //       ancestor = ancestor.parentElement;
        //     }
        //   },
        // },
      ],
    };
  },
  ({ context }) => {
    const applyStyles = applyStylesFactory(window);
    return {
      isActiveForContext: isActiveForApp(context, "/CaseReview/"),
      subscriptions: [
        {
          cssSelector: "#\\$b3 #b3-header2",
          handler: applyStyles({ display: "none" }),
        },
        {
          cssSelector: "#b1-GlobalNavigation #\\$b3:not(cps-global-header header)",
          handler: (element: HTMLElement) => {
            const cpsHeader: HTMLCpsGlobalHeaderElement = window.document.createElement("cps-global-header");
            applyStyles({ maxWidth: "1280px" })(cpsHeader);
            element.insertBefore(cpsHeader, element.firstChild);
            _debug("inserting our header");
          },
        },
        {
          cssSelector: ".feedback-message-error",
          handler: applyStyles({ display: "none" }),
        },
      ],
    };
  },
  ({ context }) => {
    const applyStyles = applyStylesFactory(window);
    return {
      isActiveForContext: isActiveForApp(context, "/Casework_Blocks/"),
      subscriptions: [
        {
          cssSelector: ".feedback-message-error",
          handler: applyStyles({ display: "none" }),
        },
      ],
    };
  },
];
