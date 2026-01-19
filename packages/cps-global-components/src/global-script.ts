import { initialiseAuth } from "./services/auth/initialise-auth";
import { initialiseStore } from "./store/store";
import { initialiseAnalytics } from "./services/analytics/initialise-analytics";
import { initialiseConfig } from "./services/config/initialise-config";
import { initialiseContext } from "./services/context/initialise-context";
import { getApplicationFlags } from "./services/application-flags/get-application-flags";
import { makeConsole } from "./logging/makeConsole";
import { initialiseDomObservation } from "./services/browser/dom/initialise-dom-observation";
import { domTagMutationSubscriber } from "./services/browser/dom/dom-tag-mutation-subscriber";
import { outSystemsShimSubscribers } from "./services/outsystems-shim/outsystems-shim-subscriber";
import { initialiseCmsSessionHint } from "./services/state/cms-session/initialise-cms-session-hint";
import { initialiseHandover } from "./services/state/handover/intialise-handover";
import { initialiseCaseDetailsData } from "./services/data/initialise-case-details-data";
import { initialiseNavigationSubscription } from "./services/browser/navigation/initialise-navigation-subscription";
import { initialiseCorrelationIds } from "./services/correlation/initialise-correlation-ids";
import { initialiseRootUrl } from "./services/root-url/initialise-root-url";
import { initialisePreview } from "./services/state/preview/initialise-preview";
import { initialiseRecentCases } from "./services/state/recent-cases/initialise-recent-cases";
import { footerSubscriber } from "./services/browser/dom/footer-subscriber";
import { accessibilitySubscriber } from "./services/browser/accessibility/accessibility-subscriber";
import { initialiseSettings } from "./services/state/settings/initialise-settings";
import { initialiseOutSystemsReconcileAuth } from "./services/outsystems-shim/initialise-outsytems-reconcile-auth";

const { _error } = makeConsole("global-script");

// Don't return a promise otherwise stencil will wait for all of this to be complete
//  before rendering.  Using the registerToStore function means we can render immediately
//  and the components themselves will know when the minimum setup that they need is
//  ready.  This means that a long-running auth process will not stop components that
//  do not need auth from rendering.
export default () => {
  /* do not await this */ initialise(window);
};

const initialise = async (window: Window & typeof globalThis) => {
  let storeFns: ReturnType<typeof initialiseStore>;
  let startupServices: Awaited<ReturnType<typeof startupPhase>>;

  const handleError = (err: Error) => {
    startupServices?.trackException?.(err);
    _error(err);
    storeFns.register({ fatalInitialisationError: err, initialisationStatus: "broken" });
  };

  try {
    storeFns = initialiseStore();
    startupServices = await startupPhase({ window, storeFns });
    authPhase({ storeFns, ...startupServices });
    contextChangePhase({ storeFns, ...startupServices });

    initialiseNavigationSubscription({
      handler: () => contextChangePhase({ storeFns, ...startupServices }),
      handleError,
    });
  } catch (err) {
    handleError(err);
  }
};

const startupPhase = async ({ window, storeFns: { register, mergeTags, readyState } }: { window: Window & typeof globalThis; storeFns: ReturnType<typeof initialiseStore> }) => {
  const build = window.cps_global_components_build;
  register({ build });

  const rootUrl = initialiseRootUrl();
  register({ rootUrl });

  const flags = getApplicationFlags({ window, rootUrl });
  register({ flags });

  initialiseOutSystemsReconcileAuth({ flags, window });

  const [cmsSessionHint, { handover, setNextHandover }, preview, settings] = await Promise.all([
    initialiseCmsSessionHint({ rootUrl, flags }),
    initialiseHandover({ rootUrl }),
    initialisePreview({ rootUrl }),
    initialiseSettings({ rootUrl }),
  ]);
  register({ cmsSessionHint, handover, preview, cmsSessionTags: { handoverEndpoint: cmsSessionHint.result?.handoverEndpoint || "" } });

  const { recentCases, setNextRecentCases } = await initialiseRecentCases({ rootUrl, preview });
  register({ recentCases });

  const config = await initialiseConfig({ rootUrl, flags, preview });
  register({ config });

  const firstContext = initialiseContext({ window, config });
  register({ firstContext });

  const { trackPageView, trackEvent, trackException } = initialiseAnalytics({ window, config, readyState, build, cmsSessionHint, flags });

  const { initialiseDomForContext } = initialiseDomObservation(
    { window, register, mergeTags, preview, settings },
    domTagMutationSubscriber,
    footerSubscriber,
    accessibilitySubscriber,
    ...outSystemsShimSubscribers,
  );

  return {
    config,
    initialiseDomForContext,
    trackPageView,
    trackEvent,
    trackException,
    firstContext,
    flags,
    handover,
    setNextHandover,
    setNextRecentCases,
  };
};

const authPhase = ({
  storeFns: { register, subscribe, readyState },
  config,
  firstContext,
  flags,
  trackEvent,
  setNextHandover,
  setNextRecentCases,
}: Awaited<ReturnType<typeof startupPhase>> & { storeFns: ReturnType<typeof initialiseStore> }) => {
  // Positioning auth after many of the other setup stuff helps us not block the UI
  // (initialiseAuth can take a long time, especially if there is a problem)
  (async () => {
    const { auth, getToken } = await initialiseAuth({ config, context: firstContext, flags });
    register({ auth });
    initialiseCaseDetailsData({ config, context: firstContext, subscribe, setNextHandover, setNextRecentCases, getToken, readyState, trackEvent });
  })();
};

const contextChangePhase = ({
  config,
  initialiseDomForContext,
  trackPageView,
  storeFns: { register, resetContextSpecificTags },
}: Awaited<ReturnType<typeof startupPhase>> & { storeFns: ReturnType<typeof initialiseStore> }) => {
  const correlationIds = initialiseCorrelationIds();
  register({ correlationIds });

  const context = initialiseContext({ window, config });
  register({ context });

  initialiseDomForContext({ context });

  // We reset the tags to empty as we could be being called after a navigate in a SPA
  resetContextSpecificTags();
  const { pathTags } = context;
  register({ pathTags });

  trackPageView({ context, correlationIds });
  register({ initialisationStatus: "complete" });
};
