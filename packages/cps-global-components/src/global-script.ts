import { detectOverrideMode } from "./services/override-mode/detect-override-mode";
// import { setupOutSystemsShim } from "./services/override-mode/outsystems-shim/setup-outsystems-shim";
import { handleOverrideSetMode } from "./services/override-mode/handle-override-set-mode";
import { initialiseAuth } from "./services/auth/initialise-auth";
import { initialiseStore, register } from "./store/store";
import { setOutSystemsFeatureFlag } from "./services/override-mode/outsystems-shim/set-outsystems-feature-flag";
import { initialiseAnalytics } from "./services/analytics/initialise-analytics";
import { initialiseConfig } from "./services/config/initialise-config";
import { isOutSystemsApp } from "./utils/is-outsystems-app";
import { initialiseContext } from "./services/context/initialise-context";
import { findContext } from "./services/context/find-context";
import { initialiseDomObservation } from "./services/dom/initialise-dom-observation";
// Don't return a promise otherwise stencil will wait for all of this to be complete
//  before rendering.  Using the register* functions means we can render immediately
//  and the components themselves will know when the minimum setup that they need is
//  ready.  This means that a long-running auth process will not stop components that
//  do not need auth from rendering.
export default /* do not make this async */ () => {
  const internal = async () => {
    let errorLogger: ReturnType<typeof initialiseAnalytics>["trackException"] | undefined;

    try {
      initialiseStore();
      handleOverrideSetMode({ window });
      //setupOutSystemsShim({ window });

      const flags = { isOverrideMode: detectOverrideMode(window), isOutSystems: isOutSystemsApp(window) };
      register({ flags });

      const config = await initialiseConfig({ flags });
      register({ config });

      const context = initialiseContext({ window, config });
      register({ context });

      const reinitialiseDomObservation = initialiseDomObservation({ window, register });
      reinitialiseDomObservation({ context });

      const auth = await initialiseAuth({ window, config, context });
      register({ auth });

      const { trackPageView, trackException } = initialiseAnalytics({ window, config, auth });
      trackPageView();
      errorLogger = trackException;

      setOutSystemsFeatureFlag({ window, flags, config, auth });

      window.navigation?.addEventListener("navigate", () => {
        const context = findContext(config.CONTEXTS, window);
        register({ context });
        trackPageView();
        reinitialiseDomObservation({ context });
      });
    } catch (error) {
      register({ fatalInitialisationError: error });
      errorLogger && errorLogger(error);
    }
  };
  internal();
};
