import type { Components, JSX } from "../types/components";

interface CpsGlobalMenu extends Components.CpsGlobalMenu, HTMLElement {}
export const CpsGlobalMenu: {
    prototype: CpsGlobalMenu;
    new (): CpsGlobalMenu;
};
/**
 * Used to define this component and all nested components recursively.
 */
export const defineCustomElement: () => void;
