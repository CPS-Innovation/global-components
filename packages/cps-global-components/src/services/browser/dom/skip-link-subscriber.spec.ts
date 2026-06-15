import { skipLinkSubscriber } from "./skip-link-subscriber";

type SkipLinks = { mainSelector?: string; searchSelector?: string; listSelector?: string; useScroll?: boolean };

const build = (skipLinks: SkipLinks | undefined) => {
  const writes: any[] = [];
  const register = (arg: any) => writes.push(arg);
  const sub = skipLinkSubscriber({ context: { skipLinks }, register } as any);
  return { sub, writes };
};

describe("skipLinkSubscriber — isActiveForContext", () => {
  it("is inactive when skipLinks is undefined", () => {
    expect(build(undefined).sub.isActiveForContext).toBe(false);
  });

  it("is inactive when skipLinks has no selectors", () => {
    expect(build({ useScroll: true }).sub.isActiveForContext).toBe(false);
  });

  it("is active when at least one selector is configured", () => {
    expect(build({ searchSelector: ".search" }).sub.isActiveForContext).toBe(true);
  });
});

describe("skipLinkSubscriber — subscriptions", () => {
  it("emits one subscription per configured selector", () => {
    const { sub } = build({ mainSelector: "#main", searchSelector: ".search", listSelector: "#list" });
    expect(sub.subscriptions.map(s => s.cssSelector)).toEqual(["#main", ".search", "#list"]);
  });

  it("does not watch main when mainSelector is absent (it uses the created-div fallback)", () => {
    const { sub } = build({ searchSelector: ".search", listSelector: "#list" });
    expect(sub.subscriptions.map(s => s.cssSelector)).toEqual([".search", "#list"]);
  });
});

describe("skipLinkSubscriber — store writes", () => {
  it("resets to an all-false baseline in the factory body", () => {
    const { writes } = build({ mainSelector: "#main", searchSelector: ".search", listSelector: "#list" });
    expect(writes[0]).toEqual({ skipLinkTargets: { main: false, search: false, list: false } });
  });

  it("resets the baseline even when no selectors are configured", () => {
    const { writes } = build(undefined);
    expect(writes[0]).toEqual({ skipLinkTargets: { main: false, search: false, list: false } });
  });

  it("each handler flips only its own key to true, accumulating", () => {
    const { sub, writes } = build({ mainSelector: "#main", searchSelector: ".search", listSelector: "#list" });
    const [main, search, list] = sub.subscriptions;

    search.handler({} as Element);
    expect(writes[writes.length - 1]).toEqual({ skipLinkTargets: { main: false, search: true, list: false } });

    list.handler({} as Element);
    expect(writes[writes.length - 1]).toEqual({ skipLinkTargets: { main: false, search: true, list: true } });

    main.handler({} as Element);
    expect(writes[writes.length - 1]).toEqual({ skipLinkTargets: { main: true, search: true, list: true } });
  });

  it("handlers keep the subscription alive (do not return truthy)", () => {
    const { sub } = build({ searchSelector: ".search" });
    expect(sub.subscriptions[0].handler({} as Element)).toBeFalsy();
  });
});
