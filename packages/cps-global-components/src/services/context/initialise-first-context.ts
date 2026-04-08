import { Config } from "cps-global-configuration";
import { FoundContext } from "./FoundContext";
import { initialiseContext } from "./initialise-context";
import { Handover } from "../state/handover/Handover";
import { Result } from "../../utils/Result";

type Register = (arg: Record<string, unknown>) => void;

export const initialiseFirstContext = ({
  window,
  config,
  handover,
  register,
}: {
  window: { location: { href: string }; sessionStorage: Storage; localStorage: Storage };
  config: Pick<Config, "CONTEXTS">;
  handover: Result<Handover>;
  register: Register;
}): FoundContext => {
  const firstContext = initialiseContext({ window, config, register, registerAs: "firstContext" });

  if (firstContext.takeTagsFromHandover && handover.found) {
    const { caseId, caseDetails } = handover.result;
    register({ handoverTags: { caseId: String(caseId), ...(caseDetails?.urn && { urn: caseDetails.urn }) } });
  }

  return firstContext;
};
