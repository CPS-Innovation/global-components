import { Config } from "cps-global-configuration";
import { fullyQualifyRequest } from "../../utils/fully-qualify-request";

import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { Handover, HandoverData } from "./Handover";
import { makeConsole } from "../../logging/makeConsole";

const { _warn } = makeConsole("initialiseHandover");

export const initialiseHandover = async ({
  config: { GATEWAY_URL },
  flags: { isOverrideMode },
}: {
  config: Config;
  flags: ApplicationFlags;
}): Promise<{ handover: Handover; setNextHandover: (data: HandoverData) => void }> => {
  if (!isOverrideMode) {
    return { handover: { found: false, error: new Error("Not enabled") }, setNextHandover: () => {} };
  } else if (!GATEWAY_URL) {
    return { handover: { found: false, error: new Error("No GATEWAY_URL") }, setNextHandover: () => {} };
  } else {
    const url = fullyQualifyRequest("/global-components/state/handover", GATEWAY_URL);
    let handover: Handover;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Response status: ${response.status} ${response.statusText}`);
      }
      const data = (await response.json()) as HandoverData | null;

      if (!data) {
        handover = { found: false, error: new Error("No data returned in response") };
      } else {
        handover = { found: true, data };
      }
    } catch (error) {
      _warn("Unexpected error retrieving handover data", String(error));
      handover = { found: false, error };
    }

    const setNextHandover = (newData: HandoverData) => {
      const isSameCaseAsBefore = handover.found && handover.data.caseDetails.id === newData.caseDetails.id;
      if (!isSameCaseAsBefore)
        try {
          fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newData),
          });
        } catch (error) {
          _warn("Unexpected error setting handover data", String(error));
        }
    };

    return { handover, setNextHandover };
  }
};
