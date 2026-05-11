import { synchroniseOsAuth } from "cps-global-os-handover";
import { Config } from "cps-global-configuration";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";

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
