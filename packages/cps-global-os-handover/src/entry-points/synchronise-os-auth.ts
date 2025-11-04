import { syncOsAuth } from "../core/storage";

export const synchroniseOsAuth = ({
  window: { location },
}: {
  window: Window;
}) => syncOsAuth(location.href);
