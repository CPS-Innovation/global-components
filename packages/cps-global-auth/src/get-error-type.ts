import { BrowserAuthError, InteractionRequiredAuthError } from "@azure/msal-browser";
import { KnownErrorType } from "./AuthResult";

const MSAL_ERROR_CODES = {
  ConditionalAccessRule: "AADSTS53003",
  MultipleIdentities: "AADSTS16000",
  IframeTimeout: "monitor_window_timeout",
  PostRequestFailed: "post_request_failed",
  NoNetworkConnectivity: "no_network_connectivity",
};

export const getErrorType = (error: unknown): KnownErrorType =>
  error instanceof InteractionRequiredAuthError && error.message.includes(MSAL_ERROR_CODES.MultipleIdentities)
    ? "MultipleIdentities"
    : error instanceof InteractionRequiredAuthError && error.message.includes(MSAL_ERROR_CODES.ConditionalAccessRule)
      ? "ConditionalAccessRule"
      : error instanceof BrowserAuthError && error.message.includes(MSAL_ERROR_CODES.IframeTimeout)
        ? "SilentFlowProblem"
        : error instanceof BrowserAuthError && error.message.includes(MSAL_ERROR_CODES.PostRequestFailed)
          ? "PostRequestFailed"
          : error instanceof BrowserAuthError && error.message.includes(MSAL_ERROR_CODES.NoNetworkConnectivity)
            ? "NoNetworkConnectivity"
            : "Unknown";
