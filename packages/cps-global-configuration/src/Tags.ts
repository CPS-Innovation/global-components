// String tags extracted at runtime from URL paths, DOM, and CMS handover state.
// Used to substitute placeholders in config templates (e.g. `{caseId}` in a
// link href) and as keys for matching contexts to URLs.
export type Tags = Record<string, string>;
