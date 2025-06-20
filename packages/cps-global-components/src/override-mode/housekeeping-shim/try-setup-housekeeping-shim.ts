import { isOverrideMode } from "../is-override-mode";
import { isHouseKeeping } from "./is-housekeeping";

const checkForTargetLinks = (element: Element) => {
  const links = element.querySelectorAll('a[href*="/polaris-ui/case-details/"]');
  
  links.forEach((link) => {
    const href = link.getAttribute('href');
    if (href && href.includes('/polaris-ui/case-details/')) {
      // Extract URN and case ID from the URL pattern
      const match = href.match(/\/polaris-ui\/case-details\/([^/]+)\/([^/?#]+)/);
      
      if (match) {
        const event = new CustomEvent('housekeeping-link-detected', {
          detail: {
            href,
            text: link.textContent,
            element: link,
            urn: match[1],
            caseId: match[2]
          }
        });
        window.dispatchEvent(event);
      }
    }
  });
};

const setupMutationObserver = () => {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            checkForTargetLinks(node as Element);
          }
        });
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  return observer;
};

export const trySetupHousekeepingShim = () => {
  if (!(isOverrideMode() && isHouseKeeping())) {
    return null;
  }

  // Check existing DOM on initial load
  checkForTargetLinks(document.body);

  // Setup mutation observer for future changes
  const observer = setupMutationObserver();

  return observer;
};
