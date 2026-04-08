import { Handover, HandoverSchema } from "./Handover";
import { makeConsole } from "../../../logging/makeConsole";
import { Result } from "../../../utils/Result";
import { fetchState } from "../fetch-state";
import { StatePutResponseSchema } from "../StatePutResponse";

const { _warn } = makeConsole("initialiseHandover");

type Register = (arg: { handover: Result<Handover> }) => void;

export const initialiseHandover = async ({ rootUrl, register }: { rootUrl: string; register: Register }): Promise<{ handover: Result<Handover>; setNextHandover: (data: Handover) => void }> => {
  const handover = await fetchState({ rootUrl, url: "../state/handover", schema: HandoverSchema });
  register({ handover });

  const setNextHandover = (data: Handover) => {
    const isSameCaseAsBefore = handover.found && handover.result.caseId === data.caseId;
    if (!isSameCaseAsBefore)
      // no need to await this
      fetchState({ rootUrl, url: "../state/handover", schema: StatePutResponseSchema, data }).catch(error => _warn("Unexpected error setting handover data", String(error)));
  };

  return { handover, setNextHandover };
};
