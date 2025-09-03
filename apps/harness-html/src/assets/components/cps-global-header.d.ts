import type { Components, JSX } from "../types/components";

interface CpsGlobalHeader extends Components.CpsGlobalHeader, HTMLElement {}
export const CpsGlobalHeader: {
    prototype: CpsGlobalHeader;
    new (): CpsGlobalHeader;
};
/**
 * Used to define this component and all nested components recursively.
 */
export const defineCustomElement: () => void;
