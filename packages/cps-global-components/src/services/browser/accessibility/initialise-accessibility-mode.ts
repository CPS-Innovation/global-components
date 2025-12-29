import { Preview } from "cps-global-configuration";
import { Result } from "../../../utils/Result";

export const initialiseAccessibilityMode = ({ preview, window: { document } }: { window: Window; preview: Result<Preview> }) => {
  if (!preview?.result?.accessibility) {
    return;
  }

  const style = document.createElement("style");
  style.id = "grey-mode-styles";
  style.textContent = `
  [data-grey-mode] { 
    background-color: #b1b4b6 !important; 
  }
  [data-grey-mode] body,
  [data-grey-mode] .govuk-template__body,
  [data-grey-mode] .govuk-main-wrapper{
    background-color: transparent !important;
  }`;
  document.head.appendChild(style);

  document.documentElement.toggleAttribute("data-grey-mode", true);
};
