import { Config } from "cps-global-configuration";
import { fullyQualifyRequest } from "../../utils/fully-qualify-request";

import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { Handover, HandoverData } from "./Handover";

export const initialiseHandover = async ({ config: { GATEWAY_URL }, flags: { isOverrideMode } }: { config: Config; flags: ApplicationFlags }): Promise<Handover> => {
  if (!isOverrideMode) {
    return { found: false, error: new Error("Not enabled") };
  }
  if (!GATEWAY_URL) {
    return { found: false, error: new Error("No GATEWAY_URL") };
  }
  try {
    const response = await fetch(fullyQualifyRequest("/global-components/state/handover", GATEWAY_URL));
    if (!response.ok) {
      throw new Error(`Response status: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as HandoverData;

    return { found: true, data };
  } catch (error) {
    return { found: false, error };
  }
};
