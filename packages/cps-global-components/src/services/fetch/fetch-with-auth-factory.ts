import { Config } from "cps-global-configuration";
import { makeConsole } from "../../logging/makeConsole";
import { typedDeepMerge } from "../../utils/typed-deep-merge";
import { GetToken } from "../auth/GetToken";
import { CorrelationIds } from "../correlation/CorrelationIds";
import { FoundContext } from "../context/FoundContext";
import { fullyQualifyRequest } from "../../utils/fully-qualify-request";

const { _error } = makeConsole("fetchWithAuthFactory");

export type FetchWithAuthProps = {
  config: Config;
  context: FoundContext;
  getToken: GetToken;
  correlationIds: CorrelationIds;
};

export const fetchWithAuthFactory =
  ({ getToken, correlationIds, config: { AD_GATEWAY_SCOPE, GATEWAY_URL }, context: { cmsAuth } }: FetchWithAuthProps) =>
  (realFetch: typeof fetch) =>
  async (...args: Parameters<typeof fetch>) => {
    const { navigationCorrelationId } = correlationIds;

    const baseRequestInit: RequestInit = {
      headers: {
        "Authorization": `Bearer ${await getToken({ config: { AD_GATEWAY_SCOPE } })}`,
        "Correlation-Id": navigationCorrelationId,
        ...(cmsAuth ? { "Cms-Auth-Values": cmsAuth } : undefined),
      },
      credentials: "include",
      referrerPolicy: "no-referrer-when-downgrade",
    };

    // Lets append our GatewayURL to the request urls...
    const request = fullyQualifyRequest(args[0], GATEWAY_URL);
    // ... and allow the caller to pass further RequestInit values (but always override with ours)
    const requestInit = args[1] === undefined ? baseRequestInit : (typedDeepMerge(baseRequestInit, args[1]) as RequestInit);

    try {
      return await realFetch(request, requestInit);
    } catch (error) {
      _error(error);
      throw error;
    }
  };
