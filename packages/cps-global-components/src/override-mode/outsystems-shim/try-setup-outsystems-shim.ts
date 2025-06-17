import { isOverrideMode } from "../is-override-mode";
import { isOutSystemsApp } from "./is-outsystems-app";

export const trySetupOutSystemsShim = () => {
  if (!(isOverrideMode() && isOutSystemsApp())) {
    return null;
  }

  console.log("Running mutation observer");
  // Hide headers
  const headers = document.querySelectorAll("header:not(cps-global-header header)");
  headers.forEach((header: HTMLElement) => {
    if (!header.closest("cps-global-header")) {
      header.style.display = "none";
    }
  });

  // Hide BlueLine
  const blueLine = document.getElementById("b1-BlueLine");
  if (blueLine) {
    blueLine.style.display = "none";
  }

  // Insert cps-global-header at the beginning of the first div with role="main"
  const mainDiv = document.querySelector('div[role="main"]');
  if (mainDiv && !document.querySelector("cps-global-header")) {
    const cpsHeader: HTMLCpsGlobalHeaderElement = document.createElement("cps-global-header");
    (cpsHeader as HTMLElement).style.cssText = "top: -50px; position: relative;";
    mainDiv.insertBefore(cpsHeader as HTMLElement, mainDiv.firstChild);
    console.log('[Header Hider Extension] cps-global-header component added to div[role="main"]');
  }

  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === "childList") {
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

        // Hide new headers
        const newHeaders = document.querySelectorAll("header:not(cps-global-header header)");
        newHeaders.forEach((header: HTMLElement) => {
          if (!header.closest("cps-global-header") && header.style.display !== "none") {
            header.style.display = "none";
          }
        });

        // Hide BlueLine if it reappears
        const newBlueLine = document.getElementById("b1-BlueLine");
        if (newBlueLine && newBlueLine.style.display !== "none") {
          newBlueLine.style.display = "none";
        }

        // Hide floating nav
        const floatingNav = document.getElementById("b1-PlaceholderNavigation");
        if (floatingNav && floatingNav.style.display !== "none") {
          floatingNav.style.display = "none";
        }

        // Check if cps-global-header still exists, if not, re-add it
        const existingCpsHeader = document.querySelector("cps-global-header");
        if (!existingCpsHeader) {
          const mainDiv = document.querySelector('div[role="main"]');
          if (mainDiv) {
            const cpsHeader = document.createElement("cps-global-header");
            (cpsHeader as HTMLElement).style.cssText = "top: -50px; position: relative;";
            mainDiv.insertBefore(cpsHeader as HTMLElement, mainDiv.firstChild);
            console.log('[Header Hider Extension] cps-global-header component RE-INSERTED to div[role="main"] after being removed');
          }
        }
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
};
