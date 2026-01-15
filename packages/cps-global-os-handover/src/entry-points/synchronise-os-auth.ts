import { syncOsAuth } from "../core/storage";

export const synchroniseOsAuth = ({
  window: { location, localStorage },
}: {
  window: Window;
}) => syncOsAuth(location.href, localStorage);
