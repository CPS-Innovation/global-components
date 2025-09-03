import type { Components, JSX } from "../types/components";

interface CpsGlobalFooter extends Components.CpsGlobalFooter, HTMLElement {}
export const CpsGlobalFooter: {
    prototype: CpsGlobalFooter;
    new (): CpsGlobalFooter;
};
/**
 * Used to define this component and all nested components recursively.
 */
export const defineCustomElement: () => void;
