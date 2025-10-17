import { handleSetOverrideMode } from "./services/override-mode/handle-set-override-mode";
import { initialiseAuth } from "./services/auth/initialise-auth";
import { initialiseStore, UpdateTags } from "./store/store";
import { initialiseAnalytics } from "./services/analytics/initialise-analytics";
import { initialiseConfig } from "./services/config/initialise-config";
import { initialiseContext } from "./services/context/initialise-context";
import { getApplicationFlags } from "./services/application-flags/get-application-flags";
import { initialiseMockAuth } from "./services/auth/initialise-mock-auth";
import { initialiseMockAnalytics } from "./services/analytics/initialise-mock-analytics";
import { _console } from "./logging/_console";
import { getCaseDetailsSubscription } from "./services/data/subscription";
import { initialiseDomObservation } from "./services/dom/initialise-dom-observation";
import { domTagMutationSubscriber } from "./services/dom/dom-tag-mutation-subscriber";
import { outSystemsShimSubscribers } from "./services/outsystems-shim/outsystems-shim-subscriber";
import { handleOutSystemsForcedAuth } from "./services/outsystems-shim/handle-outsystems-force-auth";
import { handleContextAuthorisation } from "./services/authorisation/handle-context-authorisation";
import { cachedResult } from "./utils/cached-result";

// Don't return a promise otherwise stencil will wait for all of this to be complete
//  before rendering.  Using the registerToStore function means we can render immediately
//  and the components themselves will know when the minimum setup that they need is
//  ready.  This means that a long-running auth process will not stop components that
//  do not need auth from rendering.
export default /* do not make this async */ () => {
  (async () => {
    handleSetOverrideMode({ window });
    initialise();

    // Every time we detect a SPA navigation (i.e. not a full page reload), lets rerun our initialisation
    //  logic as out context may have changed
    window.navigation?.addEventListener("navigatesuccess", async event => {
      _console.debug("Global script", "navigation", event);
      initialise();
    });
  })();
};

const initialise = async () => {
  const { register, updateTags: u, resetTags } = cachedResult("store", () => initialiseStore(getCaseDetailsSubscription));
  updateTags = u;
  // We reset the tags to empty as we could be being called after a navigate in a SPA
  resetTags();

  try {
    // Several of the operations below need only be run when we first spin up and not on any potential SPA navigation.
    //  We use `cachedResult` give us the ability to rerun this function many times while ensuring that the one-time-only
    //  operations are only executed once (alternative would be lots of if statements or similar)
    const { initialiseDomForContext } = cachedResult("dom", () =>
      initialiseDomObservation({ window }, domTagMutationSubscriber({ updateTags }), ...outSystemsShimSubscribers({ window })),
    );

    const flags = cachedResult("flags", () => getApplicationFlags({ window }));
    register({ flags });

    const config = await cachedResult("config", () => initialiseConfig({ flags }));
    register({ config });

    const context = initialiseContext({ window, config });
    register({ context });
    updateTags({ tags: context.pathTags, source: "path" });

    initialiseDomForContext({ context });
    handleOutSystemsForcedAuth({ window, config, context });

    const auth = await cachedResult("auth", () => (flags.isE2eTestMode ? initialiseMockAuth({ window }) : initialiseAuth({ window, config, context })));
    register({ auth });
    handleContextAuthorisation({ window, context, auth });

    const { trackPageView } = cachedResult("analytics", () => (flags.isE2eTestMode ? initialiseMockAnalytics() : initialiseAnalytics({ window, config, auth })));
    trackPageView();
  } catch (error) {
    _console.error(error);
    register({ fatalInitialisationError: error });
  }
};

export let updateTags: UpdateTags;
