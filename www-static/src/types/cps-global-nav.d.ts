declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        ["cps-global-nav"]: React.DetailedHTMLProps<
          React.HTMLAttributes<HTMLElement>,
          HTMLElement
        >;
      }
    }
  }
}

export {};
