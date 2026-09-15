// Stable id on the cps-global-footer host element so the "Skip to footer" link
// in cps-skip-links can resolve a target regardless of whether the footer was
// shimmed in by footer-subscriber or placed statically by a host page.
// Lives in its own module because Stencil disallows non-class exports from a
// @Component file.
export const FOOTER_SKIP_TARGET_ID = "cps-global-footer-skip-target";
