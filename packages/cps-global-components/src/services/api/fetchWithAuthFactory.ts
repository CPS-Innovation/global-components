import { Config } from "cps-global-configuration";
import { makeConsole } from "../../logging/makeConsole";
import { ReadyStateHelper } from "../../store/ready-state-factory";
import { typedDeepMerge } from "../../utils/typed-deep-merge";
import { GetToken } from "../auth/GetToken";
import { emptyCorrelationIds } from "../correlation/CorrelationIds";
import { FoundContext } from "../context/FoundContext";
import { withLogging } from "../../logging/with-logging";

const { _error } = makeConsole("fetchWithAuthFactory");

export type FetchWithAuthProps = {
  config: Config;
  context: FoundContext;
  getToken: GetToken;
  readyState: ReadyStateHelper;
};

export const fetchWithAuthFactory = ({ getToken, readyState, config: { AD_GATEWAY_SCOPE, GATEWAY_URL }, context: { cmsAuth } }: FetchWithAuthProps) =>
  withLogging("fetchWithAuth", async (...args: Parameters<typeof fetch>) => {
    const state = readyState("correlationIds");
    const { navigationCorrelationId } = state.isReady ? state.state.correlationIds : emptyCorrelationIds;

    const baseRequestInit: RequestInit = {
      headers: {
        "Authorization": `Bearer ${await getToken({ config: { AD_GATEWAY_SCOPE } })}`,
        "Correlation-Id": navigationCorrelationId,
        "Cms-Auth-Values": encodeURIComponent(cmsAuth || ""),
      },
      credentials: "include",
    };

    // Lets append our GatewayURL to the request urls...
    const request = fullyQualifyRequest(args[0], GATEWAY_URL);
    // ... and allow the caller to pass further RequestInit values (but always override with ours)
    const requestInit = args[1] === undefined ? baseRequestInit : (typedDeepMerge(baseRequestInit, args[1]) as RequestInit);

    try {
      return await fetch(request, requestInit);
    } catch (error) {
      _error(error);
      throw error;
    }
  });

const fullyQualifyRequest = (request: Parameters<typeof fetch>[0], baseUrl: string = "") => {
  const resolveUrl = (url: string | URL) => (URL.canParse(baseUrl) ? new URL(url, baseUrl).toString() : baseUrl + url.toString());

  return request instanceof Request ? { ...request, url: resolveUrl(request.url) } : resolveUrl(request);
};
