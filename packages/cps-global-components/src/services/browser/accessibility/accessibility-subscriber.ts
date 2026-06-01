import { Settings } from "cps-global-configuration";
import { DomMutationObserver } from "../dom/DomMutationObserver";

type Tone = NonNullable<Settings["accessibilityBackground"]>;

type Theme = {
  pageSurface: string; // near-white surfaces → this
  raisedSurface: string; // already-light-grey surfaces → this (preserves layer separation)
  softText: string; // near-pure-black text → this
};

// Starting values — validated to stay >= WCAG 7:1 against softText by the accompanying spec.
export const THEMES: Record<Tone, Theme> = {
  "soft-grey": { pageSurface: "#f3f2f1", raisedSurface: "#e1e1e1", softText: "#0b0c0c" },
  warm: { pageSurface: "#f5f0e6", raisedSurface: "#ece4d3", softText: "#0b0c0c" },
};

// Luminance bands for classifying a computed colour.
const PAGE_SURFACE_MIN_LUM = 0.92; // >= this → near-white → pageSurface
const RAISED_SURFACE_MIN_LUM = 0.8; // [0.8, 0.92) → light grey → raisedSurface
const TEXT_SOFTEN_MAX_LUM = 0.02; // <= this → near-pure-black text → softText
const MIN_OPAQUE_ALPHA = 0.5; // ignore (semi-)transparent colours — nothing to recolour

type Colour = { r: number; g: number; b: number; a: number };

// Parse a computed "rgb(...)"/"rgba(...)" string into channels, or null if not parseable.
const parseColour = (value: string): Colour | null => {
  const parts = value.match(/[\d.]+/g);
  if (!parts || parts.length < 3) {
    return null;
  }
  const [r, g, b, a] = parts.map(Number);
  return { r, g, b, a: a ?? 1 };
};

// WCAG relative luminance (0 = black, 1 = white).
export const relativeLuminance = ({ r, g, b }: { r: number; g: number; b: number }): number => {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

export const accessibilitySubscriber: DomMutationObserver = ({ preview, window, settings }) => {
  const { document } = window;

  const tone = settings.result?.accessibilityBackground;
  const theme = tone ? THEMES[tone] : undefined;

  // Step aside for Windows High Contrast Mode: the browser is actively forcing the OS
  //  palette, so recolouring would fight it. matchMedia is optional-chained for non-browser
  //  (mock-doc / SSR) environments, where it is treated as "not forced".
  const forcedColors = !!window.matchMedia?.("(forced-colors: active)")?.matches;

  // WeakSet so no memory leaks if e.g. we are on a SPA and there are multiple route
  //  navigations.
  const processed = new WeakSet<Element>();
  let pending: HTMLElement[] = [];
  let rafId: number | null = null;

  const flush = () => {
    const toProcess = pending;
    pending = [];
    rafId = null;
    if (!theme) {
      return;
    }

    // Pass 1: read computed colours only (no writes) to avoid interleaved read/write layout thrash.
    const writes = toProcess.map(element => {
      const computed = window.getComputedStyle(element);
      const bg = parseColour(computed.backgroundColor);
      const fg = parseColour(computed.color);

      let backgroundColor: string | undefined;
      if (bg && bg.a >= MIN_OPAQUE_ALPHA) {
        const lum = relativeLuminance(bg);
        if (lum >= PAGE_SURFACE_MIN_LUM) {
          backgroundColor = theme.pageSurface;
        } else if (lum >= RAISED_SURFACE_MIN_LUM) {
          backgroundColor = theme.raisedSurface;
        }
      }

      let color: string | undefined;
      if (fg && fg.a >= MIN_OPAQUE_ALPHA && relativeLuminance(fg) <= TEXT_SOFTEN_MAX_LUM) {
        color = theme.softText;
      }

      return { element, backgroundColor, color };
    });

    // Pass 2: apply all writes together.
    writes.forEach(({ element, backgroundColor, color }) => {
      if (backgroundColor) {
        element.style.backgroundColor = backgroundColor;
      }
      if (color) {
        element.style.color = color;
      }
    });
  };

  const queueElement = (element: HTMLElement) => {
    pending.push(element);
    if (!rafId) {
      rafId = window.requestAnimationFrame(flush);
    }
  };

  return {
    isActiveForContext: !!preview.result?.accessibility && !!theme && !forcedColors,
    subscriptions: [
      // Top-level CSS approach for document background.
      {
        cssSelector: "html",
        handler: (element: Element) => {
          if (!theme || !tone || document.getElementById("grey-mode-styles")) {
            return true;
          }

          const style = document.createElement("style");
          style.id = "grey-mode-styles";
          style.textContent = `
  [data-grey-mode] {
    background-color: ${theme.pageSurface} !important;
  }
  [data-grey-mode] body,
  [data-grey-mode] .govuk-template__body,
  [data-grey-mode] .govuk-main-wrapper {
    background-color: transparent !important;
  }
  @media (forced-colors: active) {
    [data-grey-mode] {
      background-color: Canvas !important;
    }
  }`;
          document.head.appendChild(style);
          // Expose the tone so shadow-DOM components (e.g. the menu band) can react via
          //  :host-context([data-grey-mode="warm"]). [data-grey-mode] presence still drives
          //  the host-page surface rule above.
          element.setAttribute("data-grey-mode", tone);
          return true;
        },
      },
      // Per-element processing for elements with explicit backgrounds. html/body are owned by
      //  the CSS rule above, so they are excluded here.
      {
        cssSelector: "*:not(input):not(textarea):not(select):not(html):not(body)",
        handler: (element: Element) => {
          if (processed.has(element)) {
            return;
          }
          processed.add(element);
          queueElement(element as HTMLElement);
        },
      },
    ],
  };
};
