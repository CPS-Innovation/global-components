import { v4 as uuidv4 } from "uuid";
import { handleSetOverrideMode } from "./services/override-mode/handle-set-override-mode";
import { initialiseAuth } from "./services/auth/initialise-auth";
import { initialiseStore, Register } from "./store/store";
import { initialiseAnalytics } from "./services/analytics/initialise-analytics";
import { initialiseConfig } from "./services/config/initialise-config";
import { initialiseContext } from "./services/context/initialise-context";
import { getApplicationFlags } from "./services/application-flags/get-application-flags";
import { initialiseMockAuth } from "./services/auth/initialise-mock-auth";
import { initialiseMockAnalytics } from "./services/analytics/initialise-mock-analytics";
import { makeConsole } from "./logging/makeConsole";
import { initialiseDomObservation } from "./services/dom/initialise-dom-observation";
import { domTagMutationSubscriber } from "./services/dom/dom-tag-mutation-subscriber";
import { outSystemsShimSubscribers } from "./services/outsystems-shim/outsystems-shim-subscriber";
import { createCache } from "./services/cache/create-cache";
import { fetchWithAuthFactory } from "./services/api/fetch-with-auth-factory";
import { caseDetailsSubscriptionFactory } from "./services/data/case-details-subscription-factory";
import { fetchWithCircuitBreaker } from "./services/api/fetch-with-circuit-breaker";
import { pipe } from "./utils/pipe";
import { initialiseCmsSessionHint } from "./services/cms-session/initialise-cms-session-hint";
import { initialiseHandover } from "./services/handover/intialise-handover";
import { initialiseInterimDcfNavigation } from "./services/outsystems-shim/initialise-interim-dcf-navigation";

const { _debug, _error } = makeConsole("global-script");

// Don't return a promise otherwise stencil will wait for all of this to be complete
//  before rendering.  Using the registerToStore function means we can render immediately
//  and the components themselves will know when the minimum setup that they need is
//  ready.  This means that a long-running auth process will not stop components that
//  do not need auth from rendering.
export default () => {
  /* do not await this */ initialise(window);
};

const loadPhase = async ({
  window,
  storeFns: { register, mergeTags, subscribe, readyState },
}: {
  window: Window & typeof globalThis;
  storeFns: ReturnType<typeof initialiseStore>;
}) => {
  handleSetOverrideMode({ window });

  const interimDcfNavigationObserver = initialiseInterimDcfNavigation({ window });

  const flags = getApplicationFlags({ window });
  register({ flags });

  const build = window.cps_global_components_build;
  register({ build });

  const config = await initialiseConfig({ flags });
  register({ config });

  const firstContext = initialiseContext({ window, config });
  register({ firstContext });

  // Opportunity to kick some async logic off early and in parallel
  const sessionHintPromise = (async () => {
    const cmsSessionHint = await initialiseCmsSessionHint({ config, flags });
    register({ cmsSessionHint });
    return { cmsSessionHint };
  })();

  const authPromise = (async () => {
    const { auth, getToken } = await (flags.e2eTestMode.isE2eTestMode ? initialiseMockAuth({ flags }) : initialiseAuth({ config, context: firstContext }));
    register({ auth });
    return { auth, getToken };
  })();

  const handoverPromise = (async () => {
    const { handover, setNextHandover } = await initialiseHandover({ config, flags });
    register({ handover });
    return { handover, setNextHandover };
  })();

  const [{ cmsSessionHint }, { auth, getToken }] = await Promise.all([sessionHintPromise, authPromise]);

  const { trackPageView, trackEvent, trackException } = flags.e2eTestMode.isE2eTestMode
    ? initialiseMockAnalytics()
    : initialiseAnalytics({ window, config, auth, readyState, build, cmsSessionHint });

  const isDataAccessEnabled = !!config.GATEWAY_URL;
  if (isDataAccessEnabled) {
    const { handover, setNextHandover } = await handoverPromise;

    subscribe(
      caseDetailsSubscriptionFactory({
        config,
        handover,
        setNextHandover,
        cache: createCache("cps-global-components-cache"),
        fetch: pipe(fetch, fetchWithCircuitBreaker({ config, trackEvent }), fetchWithAuthFactory({ config, context: firstContext, getToken, readyState })),
      }),
    );
  }

  const { initialiseDomForContext } = initialiseDomObservation(
    { window, register, mergeTags },
    domTagMutationSubscriber,
    interimDcfNavigationObserver,
    ...outSystemsShimSubscribers,
  );

  return {
    config,
    initialiseDomForContext,
    trackPageView,
    trackException,
  };
};

const contextPhase = ({
  config,
  initialiseDomForContext,
  trackPageView,
  scriptLoadCorrelationId,
  navigationCorrelationId,
  storeFns: { register, resetContextSpecificTags },
}: Awaited<ReturnType<typeof loadPhase>> & { storeFns: ReturnType<typeof initialiseStore> } & { scriptLoadCorrelationId: string; navigationCorrelationId: string }) => {
  // We reset the tags to empty as we could be being called after a navigate in a SPA
  resetContextSpecificTags();
  const correlationIds = { scriptLoadCorrelationId, navigationCorrelationId };
  register({ correlationIds });

  const context = initialiseContext({ window, config });
  register({ context });
  initialiseDomForContext({ context });

  const { pathTags } = context;
  register({ pathTags });

  trackPageView({ context, correlationIds });

  register({ initialisationStatus: "complete" });
};

const initialise = async (window: Window & typeof globalThis) => {
  let register: Register | undefined = undefined;
  let trackException: ((err: Error) => void) | undefined = undefined;
  const handleError = (err: Error) => {
    trackException?.(err);
    _error(err);
    register?.({ fatalInitialisationError: err, initialisationStatus: "broken" });
  };

  try {
    const scriptLoadCorrelationId = uuidv4();

    const storeFns = initialiseStore();
    register = storeFns.register;

    const loadResult = await loadPhase({ window, storeFns });
    trackException = loadResult.trackException;

    // It is meaningful in our analytics when navigationCorrelationId === scriptLoadCorrelationId as we know
    //  those entries are for page load rather than subsequent SPA-navigated-to pages
    contextPhase({ storeFns, ...loadResult, scriptLoadCorrelationId, navigationCorrelationId: scriptLoadCorrelationId });

    // Every time we detect a SPA navigation (i.e. not a full page reload), lets rerun our initialisation
    //  logic as out context may have changed
    window.navigation?.addEventListener("navigatesuccess", async event => {
      try {
        _debug("navigation", event);
        contextPhase({ storeFns, ...loadResult, scriptLoadCorrelationId, navigationCorrelationId: uuidv4() });
      } catch (err) {
        handleError(err);
      }
    });
  } catch (err) {
    handleError(err);
  }
};

// if (flags.isOverrideMode) {
//   const timestamp = +new Date();
//   augmentedFetch("state/experimental-state", { method: "PUT", body: JSON.stringify({ foo: "bar", timestamp }) })
//     .then(response => response.statusText)
//     .then(() => augmentedFetch("state/experimental-state"))
//     .then(response => response.json())
//     .then(response => _debug("Experimental state check, expected", timestamp, response))
//     .catch(reason => _debug("Experimental fetch token-check error", reason));
//   //   fetch(config.GATEWAY_URL + "cms-session-hint", { credentials: "include" })
//   //     .then(response => response.json())
//   //     .then(content => _debug("Experimental fetch cms-session-hint", content))
//   //     .catch(reason => _debug("Experimental fetch cms-session-hint error", reason));

//   // [
//   //   "https://polaris-qa-notprod.cps.gov.uk/polaris",
//   //   "https://cin2.cps.gov.uk/polaris",
//   //   "https://cin3.cps.gov.uk/polaris",
//   //   "https://cin4.cps.gov.uk/polaris",
//   //   "https://cin5.cps.gov.uk/polaris",
//   // ].map(endpoint =>
//   //   fetch(config.GATEWAY_URL + "upstream-handover-health-check?url=" + encodeURIComponent(endpoint))
//   //     .then(response => (response.ok ? response.json() : Promise.resolve({ ...response })))
//   //     .then(obj => _debug("Experimental endpoint health check", obj))
//   //     .catch(reason => _debug("Experimental endpoint health error", reason)),
//   // );

//   // fetch(config.GATEWAY_URL + "cookie", { method: "POST", credentials: "include" })
//   //   .then(response => response.text())
//   //   .then(content => _debug("Experimental fetch", content))
//   //   .catch(reason => _debug("Experimental fetch error", reason));
// }
