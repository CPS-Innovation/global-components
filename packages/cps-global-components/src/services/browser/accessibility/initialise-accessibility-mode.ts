import { Preview } from "cps-global-configuration";
import { Result } from "../../../utils/Result";

export const initialiseAccessibilityMode = ({ preview, window: { document } }: { window: Window; preview: Result<Preview> }) => {
  if (!preview?.result?.accessibility) {
    return;
  }

  const style = document.createElement("style");
  style.id = "grey-mode-styles";
  style.textContent = `[data-grey-mode] body { background-color: #b1b4b6 !important; }`;
  document.head.appendChild(style);

  document.documentElement.toggleAttribute("data-grey-mode", true);
};
