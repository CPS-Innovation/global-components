import { makeConsole } from "../../logging/makeConsole";
import { ReadyStateHelper } from "../../store/ready-state-factory";
import { typedDeepMerge } from "../../utils/typed-deep-merge";
import { GetToken } from "../auth/GetToken";
import { emptyCorrelationIds } from "../correlation/CorrelationIds";

const { _warn, _error } = makeConsole("fetchWithAuthFactory");

export type FetchWithAuthProps = {
  getToken: GetToken;
  readyState: ReadyStateHelper;
};

export const fetchWithAuthFactory = ({ getToken, readyState }: FetchWithAuthProps) => {
  const state = readyState("config", "context");
  if (!state.isReady) {
    throw new Error("fetchWithAuthFactory called when not ready");
  }
  const {
    state: {
      config: { AD_GATEWAY_SCOPE, GATEWAY_URL },
      context: { cmsAuth },
    },
  } = state;

  return async (...args: Parameters<typeof fetch>) => {
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

    const request = args[0] instanceof Request ? { ...args[0], url: new URL(args[0].url, GATEWAY_URL).toString() } : new URL(args[0], GATEWAY_URL);
    const requestInit = args[1] === undefined ? baseRequestInit : (typedDeepMerge(baseRequestInit, args[1]) as RequestInit);
    try {
      const response = await fetch(request, requestInit);
      _warn({ response });
      return response;
    } catch (error) {
      _error(error);
      throw error;
    }
  };
};
