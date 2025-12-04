import { Config } from "cps-global-configuration";
import { fullyQualifyRequest } from "../../utils/fully-qualify-request";
import { CmsSessionHint, CmsSessionHintResult } from "./CmsSessionHint";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";

export const initialiseCmsSessionHint = async ({
  config: { GATEWAY_URL },
  flags: { isOverrideMode },
}: {
  config: Config;
  flags: ApplicationFlags;
}): Promise<CmsSessionHintResult> => {
  if (!isOverrideMode) {
    return { found: false, error: new Error("Not enabled") };
  }
  if (!GATEWAY_URL) {
    return { found: false, error: new Error("No GATEWAY_URL") };
  }
  try {
    const response = await fetch(fullyQualifyRequest("/global-components/session-hint", GATEWAY_URL), { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Response status: ${response.status} ${response.statusText}`);
    }
    const hint = (await response.json()) as CmsSessionHint;

    return { found: true, hint };
  } catch (error) {
    return { found: false, error };
  }
};
