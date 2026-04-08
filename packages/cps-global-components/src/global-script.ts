import { initialiseAuth } from "./services/auth/initialise-auth";
import { initialiseStore } from "./store/store";
import { initialiseAnalytics } from "./services/analytics/initialise-analytics";
import { initialiseConfig } from "./services/config/initialise-config";
import { initialiseContext } from "./services/context/initialise-context";
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
  storeFns: { register, mergeTags, get, subscribe, readyState, resetContextSpecificTags },
}: {
  window: Window & typeof globalThis;
  storeFns: ReturnType<typeof initialiseStore>;
}) => {
  const build = initialiseBuild({ window, register });
  const rootUrl = initialiseRootUrl({ register });
  initialiseNavigateCms({ window, rootUrl });
  const flags = initialiseApplicationFlags({ window, rootUrl, register });
  initialiseOutSystemsReconcileAuth({ flags, window });

  const [{ setNextHandover }, preview, settings, { authHint, setAuthHint }] = await Promise.all([
    initialiseHandover({ rootUrl, register }),
    initialisePreview({ rootUrl, register }),
    initialiseSettings({ rootUrl }),
    initialiseAuthHint({ rootUrl, register }),
    initialiseCmsSessionHint({ rootUrl, flags, register }),
  ]);

  const { initialiseDomForContext } = initialiseDomObservation(
    { window, register, mergeTags, preview, settings },
    domTagMutationSubscriber,
    footerSubscriber,
    hostAppEventSubscriber,
    accessibilitySubscriber,
    ...outSystemsShimSubscribers,
  );

  initialiseTabTitle({ window, preview, subscribe });

  const config = await initialiseConfig({ rootUrl, flags, preview, register });
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

  // Create the first context to obtain the redirect URI for the MSAL instance.
  // This context is used only for MSAL setup — auth itself runs per-context in contextChangePhase.
  const { initialiseAuthForContext } = initialiseAuth({
    config,
    flags,
    onError: trackException,
    diagnosticsCollector,
    register,
    registerAuthWithAnalytics,
    setAuthHint,
  });

  return {
    config,
    initialiseDomForContext,
    trackPageView,
    trackException,
    registerCorrelationIdsWithAnalytics,
    initialiseAuthForContext,
    resetContextSpecificTags,
    authHint,
    preview,
    setNextHandover,
    setNextRecentCases,
    subscribe,
    readyState,
    trackEvent,
  };
};

const contextChangePhase = ({
  config,
  initialiseDomForContext,
  trackPageView,
  registerCorrelationIdsWithAnalytics,
  initialiseAuthForContext,
  storeFns: { register, resetContextSpecificTags },
  window,
  authHint,
  preview,
  setNextHandover,
  setNextRecentCases,
  subscribe,
  readyState,
  trackEvent,
}: Awaited<ReturnType<typeof startupPhase>> & { storeFns: ReturnType<typeof initialiseStore>; window: Window & typeof globalThis }) => {
  initialiseCorrelationIds({ register, registerCorrelationIdsWithAnalytics });
  const context = initialiseContext({ window, config, register, resetContextSpecificTags });
  initialiseDomForContext({ context });

  trackPageView({ context });

  // Auth is non-blocking — fire and forget. The concurrency guard inside
  // initialiseAuthForContext handles rapid SPA navigation.
  (async () => {
    const { auth, getToken } = await initialiseAuthForContext(context);
    initialiseOutSystemsShowAlert({ context, config, auth, authHint, preview });
    // TODO: initialiseCaseDetailsData is called on every context change. The subscription
    // factory inside it may set up duplicate subscriptions. Needs rethinking.
    initialiseCaseDetailsData({
      config,
      context,
      subscribe,
      setNextHandover,
      setNextRecentCases,
      getToken,
      readyState,
      trackEvent,
      preventDataCalls: context.preventADAndDataCalls,
    });
  })();

  register({ initialisationStatus: "complete" });
};
