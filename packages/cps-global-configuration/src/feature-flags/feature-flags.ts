import type { AuthHint } from "../AuthHint";
import type { AuthResult } from "../AuthResult";
import type { ApplicationFlags } from "../ApplicationFlags";
import type { Config } from "../Config";
import type { FoundContext } from "../FoundContext";
import type { Preview } from "../Preview";
import type { Result } from "../Result";
import { getFeatureFlagAssignment } from "./get-feature-flag-assignment";

// Parameter shapes used by individual flag predicates. Plain object types
// (not Pick<State, ...>) so this module stays self-contained — usable from
// the host bundle, the handover bundle, and tests without dragging in the
// host's store types.
//
// Optionality: `auth`, `authHint`, `preview` may not have resolved yet
// (handover-bundle entry, very early startup). Predicates handle undefined
// gracefully via `?.` chains and the resolveAuth fallback inside
// getFeatureFlagAssignment.

type FlagInputs = {
  config: Config;
  preview?: Result<Preview>;
  flags?: ApplicationFlags;
  context?: FoundContext;
  auth?: AuthResult;
  authHint?: Result<AuthHint>;
};

// Resolution order: a preview value always wins (including "off", the explicit
// "force hidden" override colleagues use to demo prod-like in QA), then the
// per-env config, then the local-dev default. "off" collapses to undefined so
// the menu's truthiness gate hides the panel rather than rendering layout "a".
const shouldShowCaseDetails = ({ preview, config, flags }: FlagInputs): "a" | "b" | undefined => {
  const resolved = preview?.result?.caseMarkers ?? config.SHOW_CASE_DETAILS ?? (flags?.isLocalDevelopment ? "a" : undefined);
  return resolved === "off" ? undefined : resolved;
};

// Gates the footer "Settings" link and the low-contrast background subscriber that
// the settings page drives — the two must move together, or a user gets a link to a
// control that silently does nothing. FEATURE_FLAG_ACCESSIBILITY_MODE_USERS carries the
// env-wide switch (generallyAvailable, on across pre-prod) plus group/ad-hoc enrolment
// for piloting in prod; it ORs with the per-user preview opt-in and the local-dev default.
//
// Note for the subscriber call site: the group/ad-hoc paths need an identity, and on a
// cold first load there is neither `auth` nor `authHint` yet, so those users get no paint
// until the next page load. generallyAvailable and preview need no identity at all.
const shouldEnableAccessibilityMode = ({ config, preview, flags, auth, authHint }: FlagInputs) =>
  !!preview?.result?.accessibility ||
  !!flags?.isLocalDevelopment ||
  getFeatureFlagAssignment({ auth, authHint, config }, "FEATURE_FLAG_ACCESSIBILITY_MODE_USERS").result;

// Used by the DOM subscriber that swaps host <footer>s for cps-global-footer.
// FOOTER_SHIM_ENABLED is the env-config switch (on in prod only); it ORs with the
// local-dev default. There is no per-user preview opt-in any more.
const shouldShimFooter = ({ config, flags }: Pick<FlagInputs, "config" | "flags">) => !!config.FOOTER_SHIM_ENABLED || !!flags?.isLocalDevelopment;

const shouldShowRecentCases = ({ preview, flags }: FlagInputs) =>
  !!preview?.result?.myRecentCasesOnHeader || !!flags?.isLocalDevelopment;

const shouldShowMenu = ({ config, auth, authHint, context }: FlagInputs): boolean => {
  if (!config.SHOW_MENU) {
    return false;
  }
  if (!context?.contextIds?.includes("materials-cwa")) {
    return true;
  }
  return getFeatureFlagAssignment({ auth, authHint, config }, "FEATURE_FLAG_MENU_USERS").result;
};

const surveyLink = ({ config }: FlagInputs) => ({ showLink: !!config.SURVEY_LINK, url: config.SURVEY_LINK });

const reportIssueLink = ({ config }: FlagInputs) => ({ showLink: !!config.REPORT_ISSUE_LINK, url: config.REPORT_ISSUE_LINK });

const accessibilityStatementLink = ({ config }: FlagInputs) => ({
  showLink: !!config.ACCESSIBILITY_STATEMENT_URL,
  url: config.ACCESSIBILITY_STATEMENT_URL,
});

// Whether to use full-page MSAL redirect (loginRedirect) instead of the
// silent SSO cascade. FEATURE_FLAG_USE_MSAL_FULL_REDIRECT_USERS decides (GA in
// test, uat and prod; a variant share in dev). The preview forceSilentSso opt-out
// always wins, so the silent branch can still be exercised by hand.
// Evaluated by the host before initialising auth, and by the handover bundle
// before doing any preemptive AD validation on the OS handover paths.
const shouldUseFullPageMsalRedirect = ({ config, preview, auth, authHint }: FlagInputs): boolean =>
  !preview?.result?.forceSilentSso && getFeatureFlagAssignment({ auth, authHint, config }, "FEATURE_FLAG_USE_MSAL_FULL_REDIRECT_USERS").result;

// THE COHORT IS THE ONLY SWITCH. There used to be a caseLocking preview flag as a
// per-user way in; it was dropped on 2026-11-06 along with caseLockingNotifications,
// so whether presence runs is now purely an environment decision: on in QA and dev
// (generallyAvailable), off in UAT, and off in prod for want of an API URL.
const shouldEnableCaseLocking = ({ config, auth, authHint }: FlagInputs) =>
  !!config.CASE_LOCKING_API_URL && getFeatureFlagAssignment({ auth, authHint, config }, "FEATURE_FLAG_CASE_LOCKING_USERS").result;

// THERE IS NO SEPARATE "SHOW" FLAG. The banner and the interruption card appear
// whenever case locking is on and somebody else is genuinely on the case (or the
// case is locked). There used to be a caseLockingNotifications preview flag that
// hid them while presence registered regardless; it was dropped on 2026-11-06
// because counting yourself already does that job — with the flag below off, a
// QA user alone on a case has nobody to be told about, so nothing appears.

// Count ourselves among the present users. Off by default, because in production
// telling someone they are viewing the case they are looking at is noise. On, a
// lone developer can see the banner without a second person — which is the only
// way to tell a working mechanism from a broken one single-handed. Classic and
// Modern apply the same rule (CCPPreview's countSelf).
const shouldCountSelfInCaseLocking = ({ preview }: FlagInputs) => !!preview?.result?.caseLockingCountSelf;

// The "Open in CMS…" dropdown offering CMS Classic and CMS Modern. The cohort is the
// per-env switch (on where the proxy can drive CMS Modern); the preview flag lets a
// user opt in anywhere else, and local dev always has it.
const shouldShowOpenInCmsModern = ({ config, preview, flags, auth, authHint }: FlagInputs) =>
  !!preview?.result?.openInCmsModern ||
  !!flags?.isLocalDevelopment ||
  getFeatureFlagAssignment({ auth, authHint, config }, "FEATURE_FLAG_OPEN_IN_CMS_MODERN_USERS").result;

export const FEATURE_FLAGS = {
  shouldShowCaseDetails,
  shouldEnableAccessibilityMode,
  shouldShimFooter,
  shouldShowRecentCases,
  shouldShowMenu,
  surveyLink,
  reportIssueLink,
  accessibilityStatementLink,
  shouldUseFullPageMsalRedirect,
  shouldEnableCaseLocking,
  shouldCountSelfInCaseLocking,
  shouldShowOpenInCmsModern,
};
