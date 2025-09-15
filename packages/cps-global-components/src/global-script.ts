import { handleOverrideSetMode } from "./services/override-mode/handle-override-set-mode";
import { initialiseAuth } from "./services/auth/initialise-auth";
import { initialiseStore } from "./store/store";
import { initialiseAnalytics } from "./services/analytics/initialise-analytics";
import { initialiseConfig } from "./services/config/initialise-config";
import { initialiseContext } from "./services/context/initialise-context";
import { findContext } from "./services/context/find-context";
import { initialiseDomObservation } from "./services/dom/initialise-dom-observation";
import { getApplicationFlags } from "./services/application-flags/get-application-flags";
import { initialiseMockAuth } from "./services/auth/initialise-mock-auth";
import { initialiseMockAnalytics } from "./services/analytics/initialise-mock-analytics";
import { _console } from "./logging/_console";
import { getCaseDetailsSubscription } from "./services/data/subscription";

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

      const flags = getApplicationFlags({ window });
      registerToStore({ flags });

      const config = await initialiseConfig({ flags });
      registerToStore({ config });

      const context = initialiseContext({ window, config });
      registerToStore({ context });

      const reinitialiseDomObservation = initialiseDomObservation({ window, registerToStore });
      reinitialiseDomObservation({ context });

      const auth = flags.isE2eTestMode ? await initialiseMockAuth({ window }) : await initialiseAuth({ window, config, context });
      registerToStore({ auth });

      const { trackPageView } = flags.isE2eTestMode ? initialiseMockAnalytics() : initialiseAnalytics({ window, config, auth });
      trackPageView();

      window.navigation?.addEventListener("navigate", () => {
        const context = findContext(config.CONTEXTS, window);
        registerToStore({ context });
        trackPageView();
        reinitialiseDomObservation({ context });
      });
    } catch (error) {
      _console.error(error);
      registerToStore({ fatalInitialisationError: error });
    }
  })();
};
