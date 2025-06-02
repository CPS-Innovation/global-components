// import "react";

// declare global {
//   namespace React {
//     namespace JSX {
//       interface IntrinsicElements {
//         "cps-global-header": React.DetailedHTMLProps<
//           React.HTMLAttributes<HTMLElement>,
//           HTMLElement
//         >;
//       }
//     }
//   }
// }

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        "cps-global-header": Partial<HTMLElementTagNameMap>;
        "cps-global-footer": Partial<HTMLElementTagNameMap>;
      }
    }
  }
}
export {};
