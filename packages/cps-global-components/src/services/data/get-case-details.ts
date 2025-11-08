import { Config } from "cps-global-configuration";
import { _console } from "../../logging/_console";
import { withLogging } from "../../logging/with-logging";
import { GetToken } from "../auth/GetToken";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { CaseDetails } from "./types";
import { CorrelationIds } from "../correlation/CorrelationIds";

type RequiredDefined<T> = {
  [K in keyof T]-?: Exclude<T[K], undefined>;
};

export type GetCaseDetailsProps = {
  caseIdentifiers: CaseIdentifiers;
  getToken: GetToken;
  config: RequiredDefined<Pick<Config, "AD_GATEWAY_SCOPE" | "GATEWAY_URL">>;
  correlationIds: CorrelationIds;
};

const getCaseDetailsInternal = async ({
  caseIdentifiers: { caseId },
  config: { AD_GATEWAY_SCOPE, GATEWAY_URL },
  getToken,
  correlationIds: { navigationCorrelationId },
}: GetCaseDetailsProps) => {
  const headers = { "Authorization": `Bearer ${await getToken({ config: { AD_GATEWAY_SCOPE } })}`, "Correlation-Id": navigationCorrelationId };

  const response = await fetch(GATEWAY_URL + caseId, { headers });
  _console.warn({ response });

  await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  return { caseId: +caseId, urn: String(new Date()), isDcf: false } as CaseDetails;
};

export const getCaseDetails = withLogging("getCaseDetails", getCaseDetailsInternal);
