import { _console } from "../../logging/_console";
import { DomMutationObserver } from "../dom/DomMutationSubscriber";

type Subscription = ReturnType<DomMutationObserver>["subscriptions"][0];

const hideExistingSubscriptionFactory = () =>
  ({
    cssSelector: ["header:not(cps-global-header header):not([class*='tabs'])", "b1-BlueLine", "b1-PlaceholderNavigation"].join(","),
    handler: (element: HTMLElement) => {
      _console.debug("OutSystems shim", "hiding", element);
      if (element && element.style.display !== "none") {
        element.style.display = "none";
      }
    },
  } as Subscription);

const insertSubscriptionFactory = (document: Document) =>
  ({
    cssSelector: "div[role='main']:not(:has(cps-global-header))",
    handler: (element: HTMLElement) => {
      const cpsHeader: HTMLCpsGlobalHeaderElement = document.createElement("cps-global-header");
      (cpsHeader as HTMLElement).style.cssText = "top: -50px; position: relative; margin-bottom: 20px;";
      element.insertBefore(cpsHeader as HTMLElement, element.firstChild);
      _console.debug("OutSystems shim", "inserting our header");
      // Check all ancestors and remove position: sticky
      let ancestor = cpsHeader.parentElement;
      while (ancestor) {
        const computedStyle = window.getComputedStyle(ancestor);
        if (computedStyle.position === "sticky") {
          ancestor.style.position = "relative";
        }
        ancestor = ancestor.parentElement;
      }
    },
  } as Subscription);

export const outSystemsShimSubscriber =
  ({ window: { document } }: { window: Window }): DomMutationObserver =>
  ({ context }) => {
    const isActiveForContext = context.found && !!context.applyOutSystemsShim;
    const subscriptions: Subscription[] = [];
    if (isActiveForContext) {
      if (context.applyOutSystemsShim === true || context.applyOutSystemsShim === "hide-existing") {
        subscriptions.push(hideExistingSubscriptionFactory());
      }
      if (context.applyOutSystemsShim === true || context.applyOutSystemsShim === "insert-new") {
        subscriptions.push(insertSubscriptionFactory(document));
      }
    }

    return {
      isActiveForContext,
      subscriptions,
    };
  };
