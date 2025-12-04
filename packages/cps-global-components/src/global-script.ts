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
import { handleOutSystemsForcedAuth } from "./services/outsystems-shim/handle-outsystems-force-auth";
import { handleContextAuthorisation } from "./services/authorisation/handle-context-authorisation";
import { cachedResult } from "./utils/cached-result";
import { CorrelationIds } from "./services/correlation/CorrelationIds";
import { createCache } from "./services/cache/create-cache";
import { fetchWithAuthFactory } from "./services/api/fetch-with-auth-factory";
import { caseDetailsSubscriptionFactory } from "./services/data/case-details-subscription-factory";
import { fetchWithCircuitBreaker } from "./services/api/fetch-with-circuit-breaker";
import { pipe } from "./utils/pipe";
import { initialiseCmsSessionHint } from "./services/cms-session/initialise-cms-session-hint";

const { _debug, _error } = makeConsole("global-script");

// Don't return a promise otherwise stencil will wait for all of this to be complete
//  before rendering.  Using the registerToStore function means we can render immediately
//  and the components themselves will know when the minimum setup that they need is
//  ready.  This means that a long-running auth process will not stop components that
//  do not need auth from rendering.
export default () => {
  const scriptLoadCorrelationId = uuidv4();
  handleSetOverrideMode({ window });
  // For first initialisation we want our two correlationIds to be the same
  /* do not await this */ initialise({ scriptLoadCorrelationId, navigationCorrelationId: scriptLoadCorrelationId }, window);

  // Every time we detect a SPA navigation (i.e. not a full page reload), lets rerun our initialisation
  //  logic as out context may have changed
  window.navigation?.addEventListener("navigatesuccess", async event => {
    _debug("navigation", event);
    initialise({ scriptLoadCorrelationId, navigationCorrelationId: uuidv4() }, window);
  });
};

let trackException: (err: Error) => void;
let register: Register;

const initialise = async (correlationIds: CorrelationIds, window: Window) => {
  try {
    const { register: r, readyState, resetContextSpecificTags, subscribe, mergeTags } = cachedResult("store", initialiseStore);
    register = r;
    register({ correlationIds });
    // We reset the tags to empty as we could be being called after a navigate in a SPA
    resetContextSpecificTags();

    const build = window.cps_global_components_build;
    register({ build });
    // Several of the operations below need only be run when we first spin up and not on any potential SPA navigation.
    //  We use `cachedResult` give us the ability to rerun this function many times while ensuring that the one-time-only
    //  operations are only executed once (alternative would be lots of if statements or similar)
    const { initialiseDomForContext } = cachedResult("dom", () =>
      initialiseDomObservation({ window, register, mergeTags }, domTagMutationSubscriber, ...outSystemsShimSubscribers),
    );

    const flags = cachedResult("flags", () => getApplicationFlags({ window }));
    register({ flags });

    const config = await cachedResult("config", () => initialiseConfig({ flags }));
    register({ config });

    const cmsSessionHint = await cachedResult("cmsSessionHint", () => initialiseCmsSessionHint({ config, flags }));
    register({ cmsSessionHint });

    const context = initialiseContext({ window, config });
    register({ context });
    initialiseDomForContext({ context });

    const { pathTags } = context;
    register({ pathTags });

    const { auth, getToken } = await cachedResult("auth", () => (flags.e2eTestMode.isE2eTestMode ? initialiseMockAuth({ flags }) : initialiseAuth({ config, context })));
    register({ auth });

    const {
      trackPageView,
      trackEvent,
      trackException: t,
    } = cachedResult("analytics", () =>
      flags.e2eTestMode.isE2eTestMode ? initialiseMockAnalytics() : initialiseAnalytics({ window, config, auth, readyState, build, cmsSessionHint }),
    );
    trackException = t;

    trackPageView({ context, correlationIds });

    handleContextAuthorisation({ window, context, auth });
    handleOutSystemsForcedAuth({ window, config, context });

    const isDataAccessEnabled = !!config.GATEWAY_URL;
    if (isDataAccessEnabled) {
      const cache = cachedResult("cache", () => createCache("cps-global-components-cache"));
      const augmentedFetch = cachedResult("fetch", () =>
        pipe(fetch, fetchWithCircuitBreaker({ config, trackEvent }), fetchWithAuthFactory({ config, context, getToken, readyState })),
      );

      cachedResult("case-details", () => subscribe(caseDetailsSubscriptionFactory({ config, cache, fetch: augmentedFetch })));

      // if (flags.isOverrideMode) {
      //   const timestamp = +new Date();
      //   augmentedFetch("state/experimental-state", { method: "PUT", body: JSON.stringify({ foo: "bar", timestamp }) })
      //     .then(response => response.statusText)
      //     .then(() => augmentedFetch("state/experimental-state"))
      //     .then(response => response.json())
      //     .then(response => _debug("Experimental state check, expected", timestamp, response))
      //     .catch(reason => _debug("Experimental fetch token-check error", reason));
      //   //   fetch(config.GATEWAY_URL + "session-hint", { credentials: "include" })
      //   //     .then(response => response.json())
      //   //     .then(content => _debug("Experimental fetch session-hint", content))
      //   //     .catch(reason => _debug("Experimental fetch session-hint error", reason));

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
    }

    register({ initialisationStatus: "complete" });
  } catch (err) {
    trackException?.(err);
    _error(err);
    register?.({ fatalInitialisationError: err, initialisationStatus: "broken" });
  }
};
