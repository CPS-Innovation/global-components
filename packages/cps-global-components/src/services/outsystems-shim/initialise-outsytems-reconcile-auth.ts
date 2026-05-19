import { synchroniseOsAuth } from "cps-global-os-handover";
import { ApplicationFlags, Config } from "cps-global-configuration";

export const initialiseOutSystemsReconcileAuth = ({
  flags: { isOutSystems, environment },
  window,
  config,
}: {
  flags: ApplicationFlags;
  window: Window;
  config: Config;
}) => {
  if (isOutSystems && ["dev", "test"].includes(environment)) {
    synchroniseOsAuth({
      window,
      cmsAuthStorageKeys: config.CMS_AUTH_STORAGE_KEYS,
    });
  }
};
