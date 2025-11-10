import { Config } from "cps-global-configuration";
import { _console } from "../../logging/_console";
import { withLogging } from "../../logging/with-logging";
import { GetToken } from "../auth/GetToken";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { CaseDetails } from "./types";
import { CorrelationIds } from "../correlation/CorrelationIds";
import { FoundContext } from "../context/FoundContext";

export type GetCaseDetailsProps = {
  caseIdentifiers: CaseIdentifiers;
  getToken: GetToken;
  config: Pick<Config, "AD_GATEWAY_SCOPE" | "GATEWAY_URL">;
  context: FoundContext;
  correlationIds: CorrelationIds;
  window: { sessionStorage: Storage; localStorage: Storage };
};

const getCaseDetailsInternal = async ({
  caseIdentifiers: { caseId },
  config: { AD_GATEWAY_SCOPE, GATEWAY_URL },
  getToken,
  context: { cmsAuthFromStorageKey },
  correlationIds: { navigationCorrelationId },
  window: { sessionStorage, localStorage },
}: GetCaseDetailsProps) => {
  if (!AD_GATEWAY_SCOPE && GATEWAY_URL) {
    return;
  }
  let headers: HeadersInit = { "Authorization": `Bearer ${await getToken({ config: { AD_GATEWAY_SCOPE } })}`, "Correlation-Id": navigationCorrelationId };

  if (cmsAuthFromStorageKey) {
    headers = { ...headers, "Cms-Auth-Values": sessionStorage.getItem(cmsAuthFromStorageKey) || localStorage.getItem(cmsAuthFromStorageKey) || "" };
  }

  const response = await fetch(GATEWAY_URL + caseId, { headers });
  _console.warn({ response });

  await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  return { caseId: +caseId, urn: String(new Date()), isDcf: false } as CaseDetails;
};

export const getCaseDetails = withLogging("getCaseDetails", getCaseDetailsInternal);
