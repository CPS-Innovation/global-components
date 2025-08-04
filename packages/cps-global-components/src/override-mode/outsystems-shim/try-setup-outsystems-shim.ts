import { isOutSystemsApp } from "../../helpers/is-outsystems-app";

const hideOSHeader = () => {
  console.log("[Header Hider Extension] HIDING the OS header");
  // Hide headers that are not inside cps-global-header or that are an OS tabs control
  const headers = document.querySelectorAll("header:not(cps-global-header header):not([class*='tabs'])");
  headers.forEach((header: HTMLElement) => {
    if (header && header.style.display !== "none") {
      header.style.display = "none";
      console.log("[Header Hider Extension] HIDDEN the OS header");
    }
  });

  // Hide BlueLine
  const blueLine = document.getElementById("b1-BlueLine");
  if (blueLine && blueLine.style.display !== "none") {
    blueLine.style.display = "none";
    console.log("[Header Hider Extension] HIDING the OS blue bar");
  }

  // Hide floating nav
  const floatingNav = document.getElementById("b1-PlaceholderNavigation");
  if (floatingNav && floatingNav.style.display !== "none") {
    floatingNav.style.display = "none";
    console.log("[Header Hider Extension] HIDING the floating nav");
  }
  console.log("[Header Hider Extension] HIDING the OS header - done");
};

const ensureGlobalHeader = () => {
  console.log("[Header Hider Extension] ENSURING global nav");
  if (document.querySelector("cps-global-header")) {
    console.log("[Header Hider Extension] ENSURING global nav - already exists");
    return;
  }

  // Insert cps-global-header at the beginning of the first div with role="main"
  const mainDiv = document.querySelector('div[role="main"]');
  if (!mainDiv) {
    console.log("[Header Hider Extension] ENSURING global nav - no main div");
    return;
  }

  const cpsHeader: HTMLCpsGlobalHeaderElement = document.createElement("cps-global-header");
  (cpsHeader as HTMLElement).style.cssText = "top: -50px; position: relative; margin-bottom: 20px;";
  mainDiv.insertBefore(cpsHeader as HTMLElement, mainDiv.firstChild);
  console.log('[Header Hider Extension] cps-global-header component added to div[role="main"]');

  // Check all ancestors and remove position: sticky
  let ancestor = cpsHeader.parentElement;
  while (ancestor) {
    const computedStyle = window.getComputedStyle(ancestor);
    if (computedStyle.position === "sticky") {
      ancestor.style.position = "relative";
      console.log("[Header Hider Extension] Removed position: sticky from ancestor element", ancestor);
    }
    ancestor = ancestor.parentElement;
  }
};

const handleMutations = (mutations: MutationRecord[]) => {
  mutations.forEach(function (mutation) {
    if (mutation.type !== "childList") {
      return;
    }
    // Check for removed cps-global-header
    mutation.removedNodes.forEach(node => {
      if (node.nodeType === 1 && node.nodeName === "CPS-GLOBAL-HEADER") {
        console.log("[Header Hider Extension] cps-global-header component was REMOVED from DOM");
      }
    });

    // Check for added cps-global-header
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === 1 && node.nodeName === "CPS-GLOBAL-HEADER") {
        console.log("[Header Hider Extension] cps-global-header component was ADDED back to DOM");
      }
    });

    hideOSHeader();
    ensureGlobalHeader();
  });
};

export const trySetupOutSystemsShim = (window: Window) => {
  if (!isOutSystemsApp(window.location.href)) {
    return;
  }
  console.log("[Header Hider Extension] Running mutation observer");

  hideOSHeader();
  ensureGlobalHeader();

  const observer = new MutationObserver(handleMutations);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
};
