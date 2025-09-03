import type { Components, JSX } from "../types/components";

interface CpsGlobalBanner extends Components.CpsGlobalBanner, HTMLElement {}
export const CpsGlobalBanner: {
    prototype: CpsGlobalBanner;
    new (): CpsGlobalBanner;
};
/**
 * Used to define this component and all nested components recursively.
 */
export const defineCustomElement: () => void;
