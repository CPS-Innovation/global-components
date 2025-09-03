/* CpsGlobalComponents custom elements */
export { CpsGlobalBanner as CpsGlobalBanner } from '../types/components/cps-global-banner/cps-global-banner';
export { defineCustomElement as defineCustomElementCpsGlobalBanner } from './cps-global-banner';
export { CpsGlobalFooter as CpsGlobalFooter } from '../types/components/cps-global-footer/cps-global-footer';
export { defineCustomElement as defineCustomElementCpsGlobalFooter } from './cps-global-footer';
export { CpsGlobalHeader as CpsGlobalHeader } from '../types/components/cps-global-header/cps-global-header';
export { defineCustomElement as defineCustomElementCpsGlobalHeader } from './cps-global-header';
export { CpsGlobalMenu as CpsGlobalMenu } from '../types/components/cps-global-menu/cps-global-menu';
export { defineCustomElement as defineCustomElementCpsGlobalMenu } from './cps-global-menu';
export { NavLink as NavLink } from '../types/components/cps-global-menu/nav-link';
export { defineCustomElement as defineCustomElementNavLink } from './nav-link';

/**
 * Get the base path to where the assets can be found. Use "setAssetPath(path)"
 * if the path needs to be customized.
 */
export declare const getAssetPath: (path: string) => string;

/**
 * Used to manually set the base path where assets can be found.
 * If the script is used as "module", it's recommended to use "import.meta.url",
 * such as "setAssetPath(import.meta.url)". Other options include
 * "setAssetPath(document.currentScript.src)", or using a bundler's replace plugin to
 * dynamically set the path at build time, such as "setAssetPath(process.env.ASSET_PATH)".
 * But do note that this configuration depends on how your script is bundled, or lack of
 * bundling, and where your assets can be loaded from. Additionally custom bundling
 * will have to ensure the static assets are copied to its build directory.
 */
export declare const setAssetPath: (path: string) => void;

/**
 * Used to specify a nonce value that corresponds with an application's CSP.
 * When set, the nonce will be added to all dynamically created script and style tags at runtime.
 * Alternatively, the nonce value can be set on a meta tag in the DOM head
 * (<meta name="csp-nonce" content="{ nonce value here }" />) which
 * will result in the same behavior.
 */
export declare const setNonce: (nonce: string) => void

export interface SetPlatformOptions {
  raf?: (c: FrameRequestCallback) => number;
  ael?: (el: EventTarget, eventName: string, listener: EventListenerOrEventListenerObject, options: boolean | AddEventListenerOptions) => void;
  rel?: (el: EventTarget, eventName: string, listener: EventListenerOrEventListenerObject, options: boolean | AddEventListenerOptions) => void;
}
export declare const setPlatformOptions: (opts: SetPlatformOptions) => void;
export * from '../types';
