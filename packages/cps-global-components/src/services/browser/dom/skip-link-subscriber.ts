import { DomMutationObserver } from "./DomMutationObserver";
import { SkipLinkTargets } from "../../../store/store";
import { makeConsole } from "../../../logging/makeConsole";

const { _debug } = makeConsole("skipLinkSubscriber");

const emptyTargets = (): SkipLinkTargets => ({ main: false, search: false, list: false });

// Watches the configured skip-link selectors and records, in the store, which of them
// are present in the DOM so the banner can decide which links to render.
//
// `arrive` fires for existing + new matches but never on removal, so a target found in
// one context would otherwise leave a stale `true` when we navigate to a context where it
// no longer exists. We reset the baseline to all-false in the factory body, which runs once
// per context change BEFORE any handler binds (see initialise-dom-observation.ts) — so a
// fresh, clean baseline is established on every navigation. The handlers then flip their own
// flag as their target appears.
export const skipLinkSubscriber: DomMutationObserver = ({ context, register }) => {
  const { mainSelector, searchSelector, listSelector } = context.skipLinks || {};

  // mainSelector is only watched when set: when absent, the main link uses the always-rendered
  // created-div fallback and needs no DOM detection.
  const watched = (
    [
      mainSelector ? { key: "main", selector: mainSelector } : null,
      searchSelector ? { key: "search", selector: searchSelector } : null,
      listSelector ? { key: "list", selector: listSelector } : null,
    ] as ({ key: keyof SkipLinkTargets; selector: string } | null)[]
  ).filter((x): x is { key: keyof SkipLinkTargets; selector: string } => x !== null);

  // Establish a clean per-context baseline before any handler can fire.
  register({ skipLinkTargets: emptyTargets() });

  // Closed over by the handlers so each can flip its own flag without re-reading the store.
  const found = emptyTargets();

  return {
    isActiveForContext: watched.length > 0,
    subscriptions: watched.map(({ key, selector }) => ({
      cssSelector: selector,
      handler: () => {
        _debug("Skip-link target found for", key, selector);
        found[key] = true;
        register({ skipLinkTargets: { ...found } });
        // Keep the subscription alive so a SPA that removes and re-adds the target re-detects it.
      },
    })),
  };
};
