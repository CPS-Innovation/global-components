import { Config, FoundContext } from "cps-global-configuration";
import { makeConsole } from "../../logging/makeConsole";
import { typedDeepMerge } from "../../utils/typed-deep-merge";
import { GetToken } from "../auth/GetToken";
import { CorrelationIds } from "../correlation/CorrelationIds";
import { fullyQualifyRequest } from "../../utils/fully-qualify-request";
import { isAbortError, navigationAbortSignal } from "../browser/navigation/page-lifecycle";

const { _error } = makeConsole("fetchWithAuthFactory");

export type FetchWithAuthProps = {
  config: Config;
  context: FoundContext;
  getToken: GetToken;
  correlationIds: CorrelationIds;
};

export const fetchWithAuthFactory =
  ({ getToken, correlationIds, config: { AD_GATEWAY_SCOPES, GATEWAY_URL }, context: { cmsAuth } }: FetchWithAuthProps) =>
  (realFetch: typeof fetch) =>
  async (...args: Parameters<typeof fetch>) => {
    const { navigationCorrelationId } = correlationIds;

    const baseRequestInit: RequestInit = {
      headers: {
        "Authorization": `Bearer ${await getToken({ config: { AD_GATEWAY_SCOPES } })}`,
        "Correlation-Id": navigationCorrelationId,
        ...(cmsAuth ? { "Cms-Auth-Values": cmsAuth } : undefined),
      },
      credentials: "include",
      referrerPolicy: "no-referrer-when-downgrade",
      // Cancel in-flight data fetches when the host navigates the page away
      // (full-page redirect). Without this the abort surfaces as
      // "TypeError: Failed to fetch" and gets tracked as a data error.
      // See page-lifecycle.ts. Callers don't pass their own RequestInit, so this
      // assignment isn't subject to the typedDeepMerge below.
      signal: navigationAbortSignal(),
    };

    // Lets append our GatewayURL to the request urls...
    const request = fullyQualifyRequest(args[0], GATEWAY_URL);
    // ... and allow the caller to pass further RequestInit values (but always override with ours)
    const requestInit = args[1] === undefined ? baseRequestInit : (typedDeepMerge(baseRequestInit, args[1]) as RequestInit);

    try {
      return await realFetch(request, requestInit);
    } catch (error) {
      // An AbortError here is an expected page-navigation cancel, not a fetch
      // failure — don't log it. Rethrow regardless; the data service's catch
      // decides (it also skips tracking AbortError).
      if (!isAbortError(error)) {
        _error(error);
      }
      throw error;
    }
  };
