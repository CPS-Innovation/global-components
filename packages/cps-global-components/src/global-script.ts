import { handleOverrideSetMode } from "./services/override-mode/handle-override-set-mode";
import { initialiseAuth } from "./services/auth/initialise-auth";
import { initialiseStore } from "./store/store";
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
import { outSystemsShimSubscriber } from "./services/outsystems-shim/outsystems-shim-subscriber";
import { handleOutSystemsForcedAuth } from "./services/outsystems-shim/handle-outsystems-force-auth";
import { handleContextAuthorisation } from "./services/authorisation/handle-context-authorisation";

// Don't return a promise otherwise stencil will wait for all of this to be complete
//  before rendering.  Using the registerToStore function means we can render immediately
//  and the components themselves will know when the minimum setup that they need is
//  ready.  This means that a long-running auth process will not stop components that
//  do not need auth from rendering.
export default /* do not make this async */ () => {
  (async () => {
    const { registerToStore } = initialiseStore(getCaseDetailsSubscription);

    try {
      handleOverrideSetMode({ window });
      const { initialiseDomForContext } = initialiseDomObservation({ window }, domTagMutationSubscriber({ registerToStore }), outSystemsShimSubscriber({ window }));

      const flags = getApplicationFlags({ window });
      registerToStore({ flags });

      const config = await initialiseConfig({ flags });
      registerToStore({ config });

      // The following logic is used here and every time we do a SPA navigation,
      //  so let's encapsulate it in a local function.
      const reinitialiseContext = () => {
        const context = initialiseContext({ window, config });
        registerToStore({ context });
        initialiseDomForContext({ context });
        handleOutSystemsForcedAuth({ window, config, context });
        return context;
      };

      const context = reinitialiseContext();

      const auth = flags.isE2eTestMode ? await initialiseMockAuth({ window }) : await initialiseAuth({ window, config, context });
      registerToStore({ auth });

      handleContextAuthorisation({ window, context, auth });

      const { trackPageView } = flags.isE2eTestMode ? initialiseMockAnalytics() : initialiseAnalytics({ window, config, auth });
      trackPageView();

      window.navigation?.addEventListener("navigate", () => {
        const context = reinitialiseContext();
        handleContextAuthorisation({ window, context, auth });
        trackPageView();
      });
    } catch (error) {
      _console.error(error);
      registerToStore({ fatalInitialisationError: error });
    }
  })();
};
