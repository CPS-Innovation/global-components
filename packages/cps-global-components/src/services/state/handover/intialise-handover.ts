import { Handover, HandoverSchema } from "./Handover";
import { makeConsole } from "../../../logging/makeConsole";
import { Result } from "../../../utils/Result";
import { fetchState } from "../fetch-state";
import { StatePutResponseSchema } from "../StatePutResponse";
import { TrackException } from "../../analytics/TrackException";

const { _warn } = makeConsole("initialiseHandover");

type Register = (arg: { handover: Result<Handover> }) => void;

export const initialiseHandover = async ({
  rootUrl,
  register,
}: {
  rootUrl: string;
  register: Register;
}): Promise<{ handover: Result<Handover>; setNextHandover: (data: Handover, trackException: TrackException) => void }> => {
  const handover = await fetchState({ rootUrl, url: "../state/handover", schema: HandoverSchema });
  register({ handover });

  const setNextHandover = (data: Handover, trackException: TrackException) => {
    const isSameCaseAsBefore = handover.found && handover.result.caseId === data.caseId;
    if (!isSameCaseAsBefore)
      // no need to await this
      fetchState({ rootUrl, url: "../state/handover", schema: StatePutResponseSchema, data }).then(r => {
        if (!r.found) {
          trackException(r.error instanceof Error ? r.error : new Error(String(r.error)), { type: "state", code: "state-handover-set" });
          _warn("Unexpected error setting handover data", String(r.error));
        }
      });
  };

  return { handover, setNextHandover };
};
