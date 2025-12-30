import { DomMutationObserver } from "../dom/DomMutationObserver";

const COLOUR_MAP: Record<string, string> = {
  "#ffffff": "#f3f2f1", // white → light grey
  "#f3f2f1": "#b1b4b6", // light grey → mid grey
};

const rgbToHex = (rgb: string): string => {
  const match = rgb.match(/\d+/g);
  if (!match) return rgb;
  return (
    "#" +
    match
      .slice(0, 3)
      .map(n => parseInt(n).toString(16).padStart(2, "0"))
      .join("")
  );
};

const processElement = (element: HTMLElement) => {
  const bg = rgbToHex(getComputedStyle(element).backgroundColor);
  const replacement = COLOUR_MAP[bg];
  if (replacement) {
    element.style.backgroundColor = replacement;
  }
};

export const accessibilitySubscriber: DomMutationObserver = ({ preview, window }) => {
  const { document } = window;

  // WeakSet so no memory leaks if e.g. we are on a SPA and there are multiple route
  //  navigations.
  const processed = new WeakSet<Element>();
  let pending: HTMLElement[] = [];
  let rafId: number | null = null;

  const flush = () => {
    const toProcess = pending;
    pending = [];
    rafId = null;
    toProcess.forEach(processElement);
  };

  const queueElement = (element: HTMLElement) => {
    pending.push(element);
    if (!rafId) {
      rafId = window.requestAnimationFrame(flush);
    }
  };

  return {
    isActiveForContext: !!preview.result?.accessibility,
    subscriptions: [
      // Top-level CSS approach for document background
      {
        cssSelector: "html",
        handler: (element: Element) => {
          if (document.getElementById("grey-mode-styles")) {
            return true;
          }

          const style = document.createElement("style");
          style.id = "grey-mode-styles";
          style.textContent = `
  [data-grey-mode] {
    background-color: #f3f2f1 !important;
  }
  [data-grey-mode] body,
  [data-grey-mode] .govuk-template__body,
  [data-grey-mode] .govuk-main-wrapper {
    background-color: transparent !important;
  }`;
          document.head.appendChild(style);
          element.toggleAttribute("data-grey-mode", true);
          return true;
        },
      },
      // Per-element processing for elements with explicit backgrounds
      {
        cssSelector: "*",
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
