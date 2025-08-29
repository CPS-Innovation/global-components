import { detectOverrideMode } from "./services/application-flags/detect-override-mode";
import { handleOverrideSetMode } from "./services/override-mode/handle-override-set-mode";
import { initialiseAuth } from "./services/auth/initialise-auth";
import { initialiseStore, registerToStore } from "./store/store";
import { setOutSystemsFeatureFlag } from "./services/override-mode/outsystems-shim/set-outsystems-feature-flag";
import { initialiseAnalytics } from "./services/analytics/initialise-analytics";
import { initialiseConfig } from "./services/config/initialise-config";
import { isOutSystemsApp } from "./services/application-flags/is-outsystems-app";
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

      const flags = { isOverrideMode: detectOverrideMode(window), isOutSystems: isOutSystemsApp(window) };
      registerToStore({ flags });

      const config = await initialiseConfig({ flags });
      registerToStore({ config });

      const context = initialiseContext({ window, config });
      registerToStore({ context });

      const reinitialiseDomObservation = initialiseDomObservation({ window, registerToStore });
      reinitialiseDomObservation({ context });

      const auth = await initialiseAuth({ window, config, context });
      registerToStore({ auth });

      const { trackPageView, trackException } = initialiseAnalytics({ window, config, auth });
      trackPageView();
      errorLogger = trackException;

      setOutSystemsFeatureFlag({ window, flags, config, auth });

      window.navigation?.addEventListener("navigate", () => {
        const context = findContext(config.CONTEXTS, window);
        registerToStore({ context });
        trackPageView();
        reinitialiseDomObservation({ context });
      });
    } catch (error) {
      registerToStore({ fatalInitialisationError: error });
      errorLogger && errorLogger(error);
    }
  };
  internal();
};
