import { detectOverrideMode } from "./services/override-mode/detect-override-mode";
import { setupOutSystemsShim } from "./services/override-mode/outsystems-shim/setup-outsystems-shim";
import { handleOverrideSetMode } from "./services/override-mode/handle-override-set-mode";
import { AuthResult, initialiseAuth } from "./services/auth/initialise-auth";
import { registerAuth, registerBroken, registerConfig, registerFlags } from "./store/store";
import { setOutSystemsFeatureFlag } from "./services/override-mode/outsystems-shim/set-outsystems-feature-flag";
import { initialiseAnalytics } from "./services/analytics/initialise-analytics";
import { Config } from "cps-global-configuration";
import { initialiseConfig } from "./services/config/initialise-config";
import { isOutSystemsApp } from "./utils/is-outsystems-app";

type Flags = { isOverrideMode: boolean; isOutSystems: boolean };

const preAsyncInitialisationLogic = () => {
  handleOverrideSetMode();
  const isOverrideMode = detectOverrideMode(window);
  const isOutSystems = isOutSystemsApp(window.location.href);
  if (isOverrideMode && isOutSystems) {
    setupOutSystemsShim();
  }
  return { isOverrideMode, isOutSystems };
};

const asyncInitialisationLogic = async ({ isOverrideMode, isOutSystems }: Flags) => {
  try {
    registerFlags({ isOverrideMode, isOutSystems });

    const config = await initialiseConfig({ isOverrideMode, isOutSystems });
    registerConfig(config);
    const auth = await initialiseAuth(window, config);
    registerAuth(auth);

    return { config, auth };
  } catch (err) {
    registerBroken(err);
    throw err;
  }
};

const postAsyncInitialisationLogic = ({ isOutSystems }: Flags, config: Config, auth: AuthResult) => {
  initialiseAnalytics(config, auth);
  if (isOutSystems && auth.isAuthed) {
    setOutSystemsFeatureFlag(auth);
  }
};

export default async () => {
  const { isOverrideMode, isOutSystems } = preAsyncInitialisationLogic();
  /* don't await */ asyncInitialisationLogic({ isOverrideMode, isOutSystems })
    .then(({ config, auth }) => postAsyncInitialisationLogic({ isOverrideMode, isOutSystems }, config, auth))
    .catch(error => console.error(error));
};
