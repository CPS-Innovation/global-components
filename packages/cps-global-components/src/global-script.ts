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
import { _console } from "./logging/_console";
import { initialiseDomObservation } from "./services/dom/initialise-dom-observation";
import { domTagMutationSubscriber } from "./services/dom/dom-tag-mutation-subscriber";
import { outSystemsShimSubscribers } from "./services/outsystems-shim/outsystems-shim-subscriber";
import { handleOutSystemsForcedAuth } from "./services/outsystems-shim/handle-outsystems-force-auth";
import { handleContextAuthorisation } from "./services/authorisation/handle-context-authorisation";
import { cachedResult } from "./utils/cached-result";
import { CorrelationIds } from "./services/correlation/CorrelationIds";
import { getCaseDetailsSubscriptionFactory } from "./services/data/get-case-details-subscription-factory";

// Don't return a promise otherwise stencil will wait for all of this to be complete
//  before rendering.  Using the registerToStore function means we can render immediately
//  and the components themselves will know when the minimum setup that they need is
//  ready.  This means that a long-running auth process will not stop components that
//  do not need auth from rendering.
export default /* do not await this */ () => {
  const scriptLoadCorrelationId = uuidv4();
  handleSetOverrideMode({ window });
  // For first initialisation we want our two correlationIds to be the same
  initialise({ scriptLoadCorrelationId, navigationCorrelationId: scriptLoadCorrelationId });

  // Every time we detect a SPA navigation (i.e. not a full page reload), lets rerun our initialisation
  //  logic as out context may have changed
  window.navigation?.addEventListener("navigatesuccess", async event => {
    _console.debug("Global script", "navigation", event);
    initialise({ scriptLoadCorrelationId, navigationCorrelationId: uuidv4() });
  });
};

const initialise = async (correlationIds: CorrelationIds) => {
  const { register: r, resetContextSpecificTags, subscribe } = cachedResult("store", () => initialiseStore());
  register = r;
  register({ correlationIds });
  // We reset the tags to empty as we could be being called after a navigate in a SPA
  resetContextSpecificTags();

  try {
    // Several of the operations below need only be run when we first spin up and not on any potential SPA navigation.
    //  We use `cachedResult` give us the ability to rerun this function many times while ensuring that the one-time-only
    //  operations are only executed once (alternative would be lots of if statements or similar)
    const { initialiseDomForContext } = cachedResult("dom", () =>
      initialiseDomObservation({ window }, domTagMutationSubscriber({ register }), ...outSystemsShimSubscribers({ window })),
    );

    const flags = cachedResult("flags", () => getApplicationFlags({ window }));
    register({ flags });

    const config = await cachedResult("config", () => initialiseConfig({ flags }));
    register({ config });

    const context = initialiseContext({ window, config });
    register({ context });

    const { pathTags } = context;
    register({ pathTags });

    initialiseDomForContext({ context });
    handleOutSystemsForcedAuth({ window, config, context });

    const { auth, getToken } = await cachedResult("auth", () => (flags.isE2eTestMode ? initialiseMockAuth({ window }) : initialiseAuth({ window, config, context })));
    register({ auth });

    handleContextAuthorisation({ window, context, auth });

    // Our context may change as SPA navigations occur, so lets just dispose of our subscriber every time
    //  and create a new one
    getCaseDetailsUnSubscriber();
    const [unSubscriber] = subscribe(getCaseDetailsSubscriptionFactory({ window, config, context, getToken, correlationIds, register }));
    getCaseDetailsUnSubscriber = unSubscriber;

    const { trackPageView, rebindTrackEvent } = cachedResult("analytics", () => (flags.isE2eTestMode ? initialiseMockAnalytics() : initialiseAnalytics({ window, config, auth })));
    rebindTrackEvent({ window, correlationIds });
    trackPageView({ context, correlationIds });
  } catch (error) {
    _console.error(error);
    register({ fatalInitialisationError: error });
  }
};

let getCaseDetailsUnSubscriber: () => void = () => {};

// todo: as using register is fire and forget, we could use an event
export let register: Register;
