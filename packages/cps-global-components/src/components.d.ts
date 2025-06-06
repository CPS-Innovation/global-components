/* eslint-disable */
/* tslint:disable */
/**
 * This is an autogenerated file created by the Stencil compiler.
 * It contains typing information for all components that exist in this project.
 */
import { HTMLStencilElement, JSXBase } from "@stencil/core/internal";
export namespace Components {
    interface CpsGlobalBanner {
    }
    interface CpsGlobalFooter {
    }
    interface CpsGlobalHeader {
    }
    interface CpsGlobalMenu {
        /**
          * @default "Please wait..."
         */
        "name": string;
    }
    interface NavLink {
        "ariaSelected"?: boolean;
        "disabled": boolean;
        "href": string;
        "label": string;
        "openInNewTab"?: boolean;
        "preferEventNavigation"?: boolean;
        "selected": boolean;
    }
}
export interface NavLinkCustomEvent<T> extends CustomEvent<T> {
    detail: T;
    target: HTMLNavLinkElement;
}
declare global {
    interface HTMLCpsGlobalBannerElement extends Components.CpsGlobalBanner, HTMLStencilElement {
    }
    var HTMLCpsGlobalBannerElement: {
        prototype: HTMLCpsGlobalBannerElement;
        new (): HTMLCpsGlobalBannerElement;
    };
    interface HTMLCpsGlobalFooterElement extends Components.CpsGlobalFooter, HTMLStencilElement {
    }
    var HTMLCpsGlobalFooterElement: {
        prototype: HTMLCpsGlobalFooterElement;
        new (): HTMLCpsGlobalFooterElement;
    };
    interface HTMLCpsGlobalHeaderElement extends Components.CpsGlobalHeader, HTMLStencilElement {
    }
    var HTMLCpsGlobalHeaderElement: {
        prototype: HTMLCpsGlobalHeaderElement;
        new (): HTMLCpsGlobalHeaderElement;
    };
    interface HTMLCpsGlobalMenuElement extends Components.CpsGlobalMenu, HTMLStencilElement {
    }
    var HTMLCpsGlobalMenuElement: {
        prototype: HTMLCpsGlobalMenuElement;
        new (): HTMLCpsGlobalMenuElement;
    };
    interface HTMLNavLinkElementEventMap {
        "cps-global-header-event": string;
    }
    interface HTMLNavLinkElement extends Components.NavLink, HTMLStencilElement {
        addEventListener<K extends keyof HTMLNavLinkElementEventMap>(type: K, listener: (this: HTMLNavLinkElement, ev: NavLinkCustomEvent<HTMLNavLinkElementEventMap[K]>) => any, options?: boolean | AddEventListenerOptions): void;
        addEventListener<K extends keyof DocumentEventMap>(type: K, listener: (this: Document, ev: DocumentEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
        addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
        addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
        removeEventListener<K extends keyof HTMLNavLinkElementEventMap>(type: K, listener: (this: HTMLNavLinkElement, ev: NavLinkCustomEvent<HTMLNavLinkElementEventMap[K]>) => any, options?: boolean | EventListenerOptions): void;
        removeEventListener<K extends keyof DocumentEventMap>(type: K, listener: (this: Document, ev: DocumentEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
        removeEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
        removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
    }
    var HTMLNavLinkElement: {
        prototype: HTMLNavLinkElement;
        new (): HTMLNavLinkElement;
    };
    interface HTMLElementTagNameMap {
        "cps-global-banner": HTMLCpsGlobalBannerElement;
        "cps-global-footer": HTMLCpsGlobalFooterElement;
        "cps-global-header": HTMLCpsGlobalHeaderElement;
        "cps-global-menu": HTMLCpsGlobalMenuElement;
        "nav-link": HTMLNavLinkElement;
    }
}
declare namespace LocalJSX {
    interface CpsGlobalBanner {
    }
    interface CpsGlobalFooter {
    }
    interface CpsGlobalHeader {
    }
    interface CpsGlobalMenu {
        /**
          * @default "Please wait..."
         */
        "name"?: string;
    }
    interface NavLink {
        "ariaSelected"?: boolean;
        "disabled"?: boolean;
        "href"?: string;
        "label"?: string;
        "onCps-global-header-event"?: (event: NavLinkCustomEvent<string>) => void;
        "openInNewTab"?: boolean;
        "preferEventNavigation"?: boolean;
        "selected"?: boolean;
    }
    interface IntrinsicElements {
        "cps-global-banner": CpsGlobalBanner;
        "cps-global-footer": CpsGlobalFooter;
        "cps-global-header": CpsGlobalHeader;
        "cps-global-menu": CpsGlobalMenu;
        "nav-link": NavLink;
    }
}
export { LocalJSX as JSX };
declare module "@stencil/core" {
    export namespace JSX {
        interface IntrinsicElements {
            "cps-global-banner": LocalJSX.CpsGlobalBanner & JSXBase.HTMLAttributes<HTMLCpsGlobalBannerElement>;
            "cps-global-footer": LocalJSX.CpsGlobalFooter & JSXBase.HTMLAttributes<HTMLCpsGlobalFooterElement>;
            "cps-global-header": LocalJSX.CpsGlobalHeader & JSXBase.HTMLAttributes<HTMLCpsGlobalHeaderElement>;
            "cps-global-menu": LocalJSX.CpsGlobalMenu & JSXBase.HTMLAttributes<HTMLCpsGlobalMenuElement>;
            "nav-link": LocalJSX.NavLink & JSXBase.HTMLAttributes<HTMLNavLinkElement>;
        }
    }
}
