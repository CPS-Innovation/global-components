import { accessibilitySubscriber, THEMES, relativeLuminance } from "./accessibility-subscriber";

type MockEl = { tagName: string; style: Record<string, string>; __computed: { backgroundColor: string; color: string } };

const makeEl = (backgroundColor: string, color = "rgb(0, 0, 0)", tagName = "DIV"): MockEl => ({
  tagName,
  style: {},
  __computed: { backgroundColor, color },
});

const makeWindow = ({ forcedColors = false }: { forcedColors?: boolean } = {}) => {
  const rafCallbacks: FrameRequestCallback[] = [];
  let appendedStyle: { id?: string; textContent?: string } | null = null;

  const win = {
    matchMedia: (query: string) => ({ matches: query.includes("forced-colors") ? forcedColors : false }),
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    },
    getComputedStyle: (el: unknown) => (el as MockEl).__computed,
    document: {
      getElementById: () => null,
      createElement: () => ({}) as { id?: string; textContent?: string },
      head: {
        appendChild: (el: { id?: string; textContent?: string }) => {
          appendedStyle = el;
        },
      },
    },
  } as unknown as Window;

  const runRaf = () => rafCallbacks.splice(0).forEach(cb => cb(0));
  return { win, runRaf, getAppendedStyle: () => appendedStyle };
};

const build = (win: Window, opts: { accessibility?: boolean; tone?: "soft-grey" | "warm" | undefined } = {}) => {
  const accessibility = opts.accessibility ?? true;
  const tone = "tone" in opts ? opts.tone : "soft-grey"; // distinguish "absent" from explicit undefined
  return accessibilitySubscriber({
    preview: accessibility ? { found: true, result: { accessibility: true } } : { found: false, error: new Error("off") },
    settings: { found: true, result: { accessibilityBackground: tone } },
    window: win,
  } as any);
};

const starHandler = (sub: ReturnType<typeof build>) => sub.subscriptions.find(s => s.cssSelector.startsWith("*"))!.handler;
const htmlHandler = (sub: ReturnType<typeof build>) => sub.subscriptions.find(s => s.cssSelector === "html")!.handler;

describe("accessibilitySubscriber — isActiveForContext", () => {
  it("is active when preview.accessibility is on, a tone is set, and not in forced-colors", () => {
    const { win } = makeWindow();
    expect(build(win).isActiveForContext).toBe(true);
  });

  it("is inactive when the preview flag is off", () => {
    const { win } = makeWindow();
    expect(build(win, { accessibility: false }).isActiveForContext).toBe(false);
  });

  it("is inactive when no tone is selected", () => {
    const { win } = makeWindow();
    expect(build(win, { tone: undefined }).isActiveForContext).toBe(false);
  });

  it("backs off (inactive) under Windows High Contrast / forced-colors: active", () => {
    const { win } = makeWindow({ forcedColors: true });
    expect(build(win).isActiveForContext).toBe(false);
  });
});

describe("accessibilitySubscriber — background classification", () => {
  it("maps near-white surfaces to the page surface", () => {
    const { win, runRaf } = makeWindow();
    const el = makeEl("rgb(255, 255, 255)");
    starHandler(build(win))(el as any);
    runRaf();
    expect(el.style.backgroundColor).toBe(THEMES["soft-grey"].pageSurface);
  });

  it("maps already-light-grey surfaces to the raised surface (preserves layer separation)", () => {
    const { win, runRaf } = makeWindow();
    const el = makeEl("rgb(243, 242, 241)"); // GDS light-grey #f3f2f1
    starHandler(build(win))(el as any);
    runRaf();
    expect(el.style.backgroundColor).toBe(THEMES["soft-grey"].raisedSurface);
  });

  it("leaves mid-tone surfaces untouched", () => {
    const { win, runRaf } = makeWindow();
    const el = makeEl("rgb(120, 120, 120)");
    starHandler(build(win))(el as any);
    runRaf();
    expect(el.style.backgroundColor).toBeUndefined();
  });

  it("leaves transparent surfaces untouched", () => {
    const { win, runRaf } = makeWindow();
    const el = makeEl("rgba(0, 0, 0, 0)");
    starHandler(build(win))(el as any);
    runRaf();
    expect(el.style.backgroundColor).toBeUndefined();
  });

  it("uses the warm theme surfaces when the warm tone is selected", () => {
    const { win, runRaf } = makeWindow();
    const el = makeEl("rgb(255, 255, 255)");
    starHandler(build(win, { tone: "warm" }))(el as any);
    runRaf();
    expect(el.style.backgroundColor).toBe(THEMES.warm.pageSurface);
  });

  it("processes each element only once", () => {
    const { win, runRaf } = makeWindow();
    const handle = starHandler(build(win));
    const el = makeEl("rgb(255, 255, 255)");
    handle(el as any);
    handle(el as any);
    runRaf();
    el.style.backgroundColor = "sentinel";
    runRaf(); // no second flush scheduled
    expect(el.style.backgroundColor).toBe("sentinel");
  });
});

describe("accessibilitySubscriber — text softening", () => {
  it("softens near-pure-black text to the GDS near-black", () => {
    const { win, runRaf } = makeWindow();
    const el = makeEl("rgba(0, 0, 0, 0)", "rgb(0, 0, 0)");
    starHandler(build(win))(el as any);
    runRaf();
    expect(el.style.color).toBe(THEMES["soft-grey"].softText);
    expect(el.style.backgroundColor).toBeUndefined();
  });

  it("leaves dark-grey text untouched", () => {
    const { win, runRaf } = makeWindow();
    const el = makeEl("rgba(0, 0, 0, 0)", "rgb(51, 51, 51)");
    starHandler(build(win))(el as any);
    runRaf();
    expect(el.style.color).toBeUndefined();
  });
});

describe("accessibilitySubscriber — injected stylesheet", () => {
  it("injects a tone-aware style with a forced-colors override and tags the root with the tone", () => {
    const { win, getAppendedStyle } = makeWindow();
    const root = { setAttribute: jest.fn() } as any;
    const done = htmlHandler(build(win))(root);

    expect(done).toBe(true);
    expect(root.setAttribute).toHaveBeenCalledWith("data-grey-mode", "soft-grey");
    const style = getAppendedStyle();
    expect(style?.id).toBe("grey-mode-styles");
    expect(style?.textContent).toContain(THEMES["soft-grey"].pageSurface);
    expect(style?.textContent).toContain("@media (forced-colors: active)");
  });

  it("tags the root with the warm tone so shadow-DOM components can react to it", () => {
    const { win } = makeWindow();
    const root = { setAttribute: jest.fn() } as any;
    htmlHandler(build(win, { tone: "warm" }))(root);

    expect(root.setAttribute).toHaveBeenCalledWith("data-grey-mode", "warm");
  });
});

describe("theme contrast (regression guard)", () => {
  const hexToRgb = (hex: string) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  });
  const contrastRatio = (fg: string, bg: string) => {
    const lightest = Math.max(relativeLuminance(hexToRgb(fg)), relativeLuminance(hexToRgb(bg)));
    const darkest = Math.min(relativeLuminance(hexToRgb(fg)), relativeLuminance(hexToRgb(bg)));
    return (lightest + 0.05) / (darkest + 0.05);
  };

  it("keeps every shipped text/surface pair at WCAG AAA (>= 7:1)", () => {
    Object.values(THEMES).forEach(theme => {
      expect(contrastRatio(theme.softText, theme.pageSurface)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(theme.softText, theme.raisedSurface)).toBeGreaterThanOrEqual(7);
    });
  });
});
