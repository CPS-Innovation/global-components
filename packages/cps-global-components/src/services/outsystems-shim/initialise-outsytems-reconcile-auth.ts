import { synchroniseOsAuth } from "cps-global-os-handover";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";

export const initialiseOutSystemsReconcileAuth = ({ flags: { isOutSystems }, window }: { flags: ApplicationFlags; window: Window }) => {
  if (isOutSystems) {
    synchroniseOsAuth({ window });
  }
};
