import { synchroniseOsAuth } from "cps-global-os-handover";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";

export const initialiseOutSystemsReconcileAuth = ({ flags: { isOutSystems, environment }, window }: { flags: ApplicationFlags; window: Window }) => {
  if (isOutSystems && environment === "dev") {
    synchroniseOsAuth({ window });
  }
};
