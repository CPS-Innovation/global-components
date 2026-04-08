import { initialiseAuth } from "./services/auth/initialise-auth";
import { initialiseStore } from "./store/store";
import { initialiseAnalytics } from "./services/analytics/initialise-analytics";
import { initialiseConfig } from "./services/config/initialise-config";
import { initialiseContext } from "./services/context/initialise-context";
import { initialiseFirstContext } from "./services/context/initialise-first-context";
import { initialiseApplicationFlags } from "./services/application-flags/initialise-application-flags";
import { makeConsole } from "./logging/makeConsole";
import { initialiseDomObservation } from "./services/browser/dom/initialise-dom-observation";
import { domTagMutationSubscriber } from "./services/browser/dom/dom-tag-mutation-subscriber";
import { outSystemsShimSubscribers } from "./services/outsystems-shim/outsystems-shim-subscriber";
import { initialiseCmsSessionHint } from "./services/state/cms-session/initialise-cms-session-hint";
import { initialiseHandover } from "./services/state/handover/intialise-handover";
import { initialiseCaseDetailsData } from "./services/data/initialise-case-details-data";
import { initialiseCorrelationIds } from "./services/correlation/initialise-correlation-ids";
import { initialiseRootUrl } from "./services/root-url/initialise-root-url";
import { initialisePreview } from "./services/state/preview/initialise-preview";
import { initialiseRecentCases } from "./services/state/recent-cases/initialise-recent-cases";
import { footerSubscriber } from "./services/browser/dom/footer-subscriber";
import { hostAppEventSubscriber } from "./services/browser/dom/host-app-event-subscriber";
import { accessibilitySubscriber } from "./services/browser/accessibility/accessibility-subscriber";
import { initialiseSettings } from "./services/state/settings/initialise-settings";
import { initialiseOutSystemsReconcileAuth } from "./services/outsystems-shim/initialise-outsytems-reconcile-auth";
import { initialiseOutSystemsShowAlert } from "./services/outsystems-shim/outsystems-show-alert";
import { initialiseNavigateCms } from "./services/navigate-cms/initialise-navigate-cms";
import { initialiseAuthHint } from "./services/state/auth-hint/initialise-auth-hint";
import { createAdDiagnosticsCollector } from "./services/auth/ad-diagnostics-collector";
import { initialiseTabTitle } from "./services/browser/tab-title/initialise-tab-title";
import { initialiseBuild } from "./services/build/initialise-build";
import { onNavigation } from "./services/browser/navigation/navigation";

const { _error } = makeConsole("global-script");

// Don't return a promise otherwise stencil will wait for all of this to be complete
//  before rendering.  Using the registerToStore function means we can render immediately
//  and the components themselves will know when the minimum setup that they need is
//  ready.  This means that a long-running auth process will not stop components that
//  do not need auth from rendering.
export default () => {
  if (window.cps_global_components_initialised) return;
  window.cps_global_components_initialised = true;
  /* do not await this */ initialise(window);
};

const initialise = async (window: Window & typeof globalThis) => {
  let storeFns: ReturnType<typeof initialiseStore>;
  let trackException: (exception: Error) => void = () => {};

  const handleError = (err: Error) => {
    trackException(err);
    _error(err);
    storeFns.register({ fatalInitialisationError: err, initialisationStatus: "broken" });
  };

  try {
    storeFns = initialiseStore();
    const startupServices = await startupPhase({ window, storeFns });
    trackException = startupServices.trackException;

    authPhase({ storeFns, ...startupServices });
    contextChangePhase({ window, storeFns, ...startupServices });

    onNavigation(() => {
      try {
        contextChangePhase({ window, storeFns, ...startupServices });
      } catch (err) {
        handleError(err);
      }
    }, window);
  } catch (err) {
    handleError(err);
  }
};

const startupPhase = async ({
  window,
  storeFns: { register, mergeTags, get, subscribe },
}: {
  window: Window & typeof globalThis;
  storeFns: ReturnType<typeof initialiseStore>;
}) => {
  const build = initialiseBuild({ window, register });
  const rootUrl = initialiseRootUrl({ register });
  initialiseNavigateCms({ window, rootUrl });
  const flags = initialiseApplicationFlags({ window, rootUrl, register });
  initialiseOutSystemsReconcileAuth({ flags, window });

  const [{ handover, setNextHandover }, preview, settings, { authHint, setAuthHint }] = await Promise.all([
    initialiseHandover({ rootUrl, register }),
    initialisePreview({ rootUrl, register }),
    initialiseSettings({ rootUrl }),
    initialiseAuthHint({ rootUrl, register }),
    initialiseCmsSessionHint({ rootUrl, flags, register }),
  ]);

  const config = await initialiseConfig({ rootUrl, flags, preview, register });

  const firstContext = initialiseFirstContext({ window, config, handover, register });
  const { setNextRecentCases } = initialiseRecentCases({ rootUrl, config, register });

  const diagnosticsCollector = createAdDiagnosticsCollector();

  const { trackPageView, trackEvent, trackException, registerAuthWithAnalytics, registerCorrelationIdsWithAnalytics } = initialiseAnalytics({
    window,
    config,
    build,
    flags,
    authHint,
    get,
    diagnosticsCollector,
  });

  const { initialiseDomForContext } = initialiseDomObservation(
    { window, register, mergeTags, preview, settings },
    domTagMutationSubscriber,
    footerSubscriber,
    hostAppEventSubscriber,
    accessibilitySubscriber,
    ...outSystemsShimSubscribers,
  );

  initialiseTabTitle({ window, preview, subscribe });

  return {
    config,
    diagnosticsCollector,
    initialiseDomForContext,
    trackPageView,
    trackEvent,
    trackException,
    registerAuthWithAnalytics,
    registerCorrelationIdsWithAnalytics,
    firstContext,
    flags,
    authHint,
    setAuthHint,
    setNextHandover,
    setNextRecentCases,
    preview,
  };
};

const authPhase = ({
  storeFns: { register, subscribe, readyState },
  config,
  diagnosticsCollector,
  firstContext,
  flags,
  trackEvent,
  trackException,
  registerAuthWithAnalytics,
  authHint,
  setAuthHint,
  setNextHandover,
  setNextRecentCases,
  preview,
}: Awaited<ReturnType<typeof startupPhase>> & { storeFns: ReturnType<typeof initialiseStore> }) => {
  // Positioning auth after many of the other setup stuff helps us not block the UI
  // (initialiseAuth can take a long time, especially if there is a problem)
  (async () => {
    const { auth, getToken } = await initialiseAuth({
      config,
      context: firstContext,
      flags,
      onError: trackException,
      diagnosticsCollector,
      register,
      registerAuthWithAnalytics,
      setAuthHint,
    });
    initialiseOutSystemsShowAlert({ context: firstContext, config, auth, authHint, preview });
    initialiseCaseDetailsData({
      config,
      context: firstContext,
      subscribe,
      setNextHandover,
      setNextRecentCases,
      getToken,
      readyState,
      trackEvent,
      preventDataCalls: firstContext.preventADAndDataCalls,
    });
  })();
};

const contextChangePhase = ({
  config,
  initialiseDomForContext,
  trackPageView,
  registerCorrelationIdsWithAnalytics,
  storeFns: { register, resetContextSpecificTags },
  window,
}: Awaited<ReturnType<typeof startupPhase>> & { storeFns: ReturnType<typeof initialiseStore>; window: Window & typeof globalThis }) => {
  initialiseCorrelationIds({ register, registerCorrelationIdsWithAnalytics });
  const context = initialiseContext({ window, config, register, resetContextSpecificTags });
  initialiseDomForContext({ context });

  trackPageView({ context });

  register({ initialisationStatus: "complete" });
};
