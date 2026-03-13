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

export const newTab = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

export const onNavigation = (handler: () => void) => {
  // If we just subscribe to navigatesuccess then we get instances when our host SPA apps
  //  triggering this event without an actual URL changing, causing duplicate analytics
  //  page views.
  let lastUrl = window.location.href.split("#")[0];
  window.navigation?.addEventListener("navigatesuccess", (ev) => {
    const currentUrl = window.location.href.split("#")[0];
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    _debug("navigation", ev);
    handler();
  });
};
