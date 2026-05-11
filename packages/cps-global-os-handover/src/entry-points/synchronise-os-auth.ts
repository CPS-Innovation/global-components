import { CmsAuthStorageKeys } from "cps-global-configuration";
import { syncOsAuth } from "../core/storage";

export const synchroniseOsAuth = ({
  window: { location, localStorage },
  cmsAuthStorageKeys,
}: {
  window: Window;
  cmsAuthStorageKeys: CmsAuthStorageKeys;
}) => syncOsAuth(location.href, localStorage, cmsAuthStorageKeys);
