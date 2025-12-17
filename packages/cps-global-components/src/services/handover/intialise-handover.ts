import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { Handover } from "./Handover";
import { makeConsole } from "../../logging/makeConsole";
import { getArtifactUrl } from "../../utils/get-artifact-url";
import { Result } from "../../utils/Result";

const { _warn } = makeConsole("initialiseHandover");

export const initialiseHandover = async ({
  rootUrl,
  flags: { isOverrideMode },
}: {
  rootUrl: string;
  flags: ApplicationFlags;
}): Promise<{ handover: Result<Handover>; setNextHandover: (data: Handover) => void }> => {
  if (!isOverrideMode) {
    return { handover: { found: false, error: new Error("Not enabled") }, setNextHandover: () => {} };
  } else {
    const url = getArtifactUrl(rootUrl, "../state/handover");
    let handover: Result<Handover>;

    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`Response status: ${response.status} ${response.statusText}`);
      }
      const result = (await response.json()) as Handover | null;

      if (!result) {
        handover = { found: false, error: new Error("No data returned in response") };
      } else {
        handover = { found: true, result };
      }
    } catch (error) {
      _warn("Unexpected error retrieving handover data", String(error));
      handover = { found: false, error };
    }

    const setNextHandover = (newData: Handover) => {
      const isSameCaseAsBefore = handover.found && handover.result.caseDetails.id === newData.caseDetails.id;
      if (!isSameCaseAsBefore)
        try {
          // no need to await this
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
