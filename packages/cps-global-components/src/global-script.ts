import { handleSetOverrideMode } from "./services/override-mode/handle-set-override-mode";
import { initialiseAuth } from "./services/auth/initialise-auth";
import { initialiseStore } from "./store/store";
import { initialiseAnalytics } from "./services/analytics/initialise-analytics";
import { initialiseConfig } from "./services/config/initialise-config";
import { initialiseContext } from "./services/context/initialise-context";
import { getApplicationFlags } from "./services/application-flags/get-application-flags";
import { makeConsole } from "./logging/makeConsole";
import { initialiseDomObservation } from "./services/browser/dom/initialise-dom-observation";
import { domTagMutationSubscriber } from "./services/browser/dom/dom-tag-mutation-subscriber";
import { outSystemsShimSubscribers } from "./services/outsystems-shim/outsystems-shim-subscriber";
import { initialiseCmsSessionHint } from "./services/cms-session/initialise-cms-session-hint";
import { initialiseHandover } from "./services/handover/intialise-handover";
import { initialiseInterimDcfNavigation } from "./services/outsystems-shim/initialise-interim-dcf-navigation";
import { initialiseCaseDetailsData } from "./services/data/initialise-case-details-data";
import { initialiseNavigationSubscription } from "./services/browser/navigation/initialise-navigation-subscription";
import { initialiseCorrelationIds } from "./services/correlation/initialise-correlation-ids";

const { _error } = makeConsole("global-script");

// Don't return a promise otherwise stencil will wait for all of this to be complete
//  before rendering.  Using the registerToStore function means we can render immediately
//  and the components themselves will know when the minimum setup that they need is
//  ready.  This means that a long-running auth process will not stop components that
//  do not need auth from rendering.
export default () => {
  /* do not await this */ initialise(window);
};

const initialise = async (window: Window & typeof globalThis) => {
  let storeFns: ReturnType<typeof initialiseStore>;
  let startupServices: Awaited<ReturnType<typeof startupPhase>>;

  const handleError = (err: Error) => {
    startupServices?.trackException?.(err);
    _error(err);
    storeFns.register({ fatalInitialisationError: err, initialisationStatus: "broken" });
  };

  try {
    storeFns = initialiseStore();
    startupServices = await startupPhase({ window, storeFns });
    contextChangePhase({ storeFns, ...startupServices });

    initialiseNavigationSubscription({
      window,
      handler: () => contextChangePhase({ storeFns, ...startupServices }),
      handleError,
    });
  } catch (err) {
    handleError(err);
  }
};

const startupPhase = async ({
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

  // Opportunity to kick some async logic off in parallel
  // There are further opportunities for optimisation
  const [cmsSessionHint, { auth, getToken }, { handover, setNextHandover }] = await Promise.all([
    initialiseCmsSessionHint({ config, flags }),
    initialiseAuth({ config, context: firstContext, flags }),
    initialiseHandover({ config, flags }),
  ]);
  register({ cmsSessionHint, auth, handover });

  const { trackPageView, trackEvent, trackException } = initialiseAnalytics({ window, config, auth, readyState, build, cmsSessionHint, flags });

  initialiseCaseDetailsData({ config, context: firstContext, subscribe, handover, setNextHandover, getToken, readyState, trackEvent });

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

const contextChangePhase = ({
  config,
  initialiseDomForContext,
  trackPageView,
  storeFns: { register, resetContextSpecificTags },
}: Awaited<ReturnType<typeof startupPhase>> & { storeFns: ReturnType<typeof initialiseStore> }) => {
  const correlationIds = initialiseCorrelationIds();
  register({ correlationIds });

  const context = initialiseContext({ window, config });
  register({ context });

  initialiseDomForContext({ context });

  // We reset the tags to empty as we could be being called after a navigate in a SPA
  resetContextSpecificTags();
  const { pathTags } = context;
  register({ pathTags });

  trackPageView({ context, correlationIds });
  register({ initialisationStatus: "complete" });
};
