import { makeConsole } from "../../../logging/makeConsole";

const { _debug } = makeConsole("navigation");

export const updateAddressQuery = (params: Record<string, string | null>, replace = false): void => {
  const url = new URL(window.location.href);

  Object.entries(params).forEach(([key, value]) => {
    if (value === null) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  });

  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", url);
};

// Full navigation to an external/cross-page href. Use this when the destination is a
//  different origin/path from the current address — the destination URL fully specifies
//  its own state, and the current page's query params don't follow.
export const navigateToHref = (href: string): void => {
  window.location.assign(new URL(href, window.location.href).toString());
};

// True when the given href resolves to the same origin and pathname as the current
//  address — i.e. clicking it should mutate query state rather than navigate away.
export const isSamePageAsCurrent = (href: string): boolean => {
  const target = new URL(href, window.location.href);
  return target.origin === window.location.origin && target.pathname === window.location.pathname;
};

export const newTab = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

export const onNavigation = (handler: () => void, win: Window & typeof globalThis = window) => {
  // If we just subscribe to navigatesuccess then we get instances when our host SPA apps
  //  triggering this event without an actual URL changing, causing duplicate analytics
  //  page views.
  let lastUrl = win.location.href.split("#")[0];
  win.navigation?.addEventListener("navigatesuccess", (ev) => {
    const currentUrl = win.location.href.split("#")[0];
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    _debug("navigation", ev);
    handler();
  });
};

export const runNowAndOnNavigation = (handler: () => void, win: Window & typeof globalThis = window) => {
  handler();
  onNavigation(handler, win);
};
