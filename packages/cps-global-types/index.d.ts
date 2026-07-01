// JSX typings for the cps-global-components custom elements, so React + TypeScript
// host apps can use <cps-global-header /> and <cps-global-footer /> without a
// "Property does not exist on type 'JSX.IntrinsicElements'" error.
//
// These are declaration-only global augmentations. They are only ever consumed
// inside a project that already has React types, so `React.*` resolves there.
//
// Note on the React namespace: the nested `React.JSX` form below is correct for
// @types/react 18.0.27+ and React 19. Projects on an older @types/react may need
// the bare-global `namespace JSX { ... }` form instead — same interface body.

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        "cps-global-header": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
        "cps-global-footer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      }
    }
  }
}

export {};
