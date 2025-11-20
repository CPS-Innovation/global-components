import { Config } from "cps-global-configuration";
import { makeConsole } from "../../logging/makeConsole";
import { withLogging } from "../../logging/with-logging";
import { GetToken } from "../auth/GetToken";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { CorrelationIds } from "../correlation/CorrelationIds";
import { FoundContext } from "../context/FoundContext";
import { CaseDetails } from "./CaseDetails";

const { _warn, _error } = makeConsole("getCaseDetails");

export type GetCaseDetailsProps = {
  caseIdentifiers: CaseIdentifiers;
  getToken: GetToken;
  config: Pick<Config, "AD_GATEWAY_SCOPE" | "GATEWAY_URL" | "CACHE_CONFIG">;
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
  if (!(AD_GATEWAY_SCOPE && GATEWAY_URL)) {
    return;
  }
  let headers: HeadersInit = {
    "Authorization": `Bearer ${await getToken({ config: { AD_GATEWAY_SCOPE } })}`,
    "Correlation-Id": navigationCorrelationId,
    "X-Application": `cps-global-components/${window.cps_global_components_build?.Sha}`,
  };

  if (cmsAuthFromStorageKey) {
    headers = { ...headers, "Cms-Auth-Values": encodeURIComponent(sessionStorage.getItem(cmsAuthFromStorageKey) || localStorage.getItem(cmsAuthFromStorageKey) || "") };
  }

  try {
    const response = await fetch(GATEWAY_URL + caseId, { headers, credentials: "include" });
    _warn({ response });
  } catch (error) {
    _error(error);
  }

  return { caseId: +caseId, urn: String(new Date()), isDcf: false } as CaseDetails;
};

export const getCaseDetails = withLogging("getCaseDetails", getCaseDetailsInternal);
