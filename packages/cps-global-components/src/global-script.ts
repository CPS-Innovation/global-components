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
import { runNowAndOnNavigation } from "./services/browser/navigation/navigation";

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
  const { register, mergeTags, subscribe, resetContextSpecificTags, caseIdentifiersWaiter } = initialiseStore();
  let trackException: (exception: Error) => void = () => {};

  const handleError = (err: Error) => {
    trackException(err);
    _error(err);
    register({ fatalInitialisationError: err, initialisationStatus: "broken" });
  };

  try {
    const build = initialiseBuild({ window, register });
    const rootUrl = initialiseRootUrl({ register });
    initialiseNavigateCms({ window, rootUrl });

    const flags = initialiseApplicationFlags({ window, rootUrl, register });
    initialiseOutSystemsReconcileAuth({ window, flags });

    const [{ handover, setNextHandover }, preview, settings, { authHint, setAuthHint }] = await Promise.all([
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

    const {
      trackPageView,
      trackEvent,
      trackException: _trackException,
      registerAuthWithAnalytics,
      registerCorrelationIdsWithAnalytics,
      registerCaseIdentifiersWithAnalytics,
    } = initialiseAnalytics({
      window,
      config,
      build,
      flags,
      authHint,
      diagnosticsCollector,
    });
    trackException = _trackException;

    const { initialiseAuthForContext } = initialiseAuth({ config, flags, onError: trackException, diagnosticsCollector, register, registerAuthWithAnalytics, setAuthHint });
    const { initialiseCaseDetailsDataForContext, initialiseCaseDetailsDataForContextOptimistic } = initialiseCaseDetailsData({
      config,
      handover,
      setNextHandover,
      setNextRecentCases,
      trackEvent,
      register,
      mergeTags,
    });
    const { initialiseCorrelationIdsForContext } = initialiseCorrelationIds({ register, registerCorrelationIdsWithAnalytics });
    const { initialiseContextForContext } = initialiseContext({ window, config, register, resetContextSpecificTags });
    const { initialiseOutSystemsShowAlertForContext } = initialiseOutSystemsShowAlert({ config, authHint, preview });

    runNowAndOnNavigation(() => {
      try {
        const correlationIds = initialiseCorrelationIdsForContext();
        caseIdentifiersWaiter.reset();

        const context = initialiseContextForContext();
        initialiseDomForContext({ context });
        trackPageView({ context });

        register({ initialisationStatus: "complete" });

        const authPromise = initialiseAuthForContext(context);
        authPromise.then(({ auth }) => initialiseOutSystemsShowAlertForContext({ context, auth })).catch(handleError);

        const caseIdentifiersPromise = caseIdentifiersWaiter.waitForChange();
        caseIdentifiersPromise
          .then(caseIdentifiers => {
            registerCaseIdentifiersWithAnalytics(caseIdentifiers?.caseId);
            initialiseCaseDetailsDataForContextOptimistic(caseIdentifiers);
          })
          .catch(handleError);

        Promise.all([authPromise, caseIdentifiersPromise])
          .then(([{ getToken }, caseIdentifiers]) => initialiseCaseDetailsDataForContext({ context, caseIdentifiers, getToken, correlationIds }))
          .catch(handleError);
      } catch (err) {
        handleError(err);
      }
    }, window);
  } catch (err) {
    handleError(err);
  }
};
