import { BrowserAuthError, InteractionRequiredAuthError } from "@azure/msal-browser";
import { KnowErrorType } from "./AuthResult";

const MSAL_ERROR_CODES = {
  ConditionalAccessRule: "AADSTS53003",
  MultipleIdentities: "AADSTS16000",
  IframeTimeout: "monitor_window_timeout",
};

export const getErrorType = (error: Error): KnowErrorType =>
  error instanceof InteractionRequiredAuthError && error.message.includes(MSAL_ERROR_CODES.MultipleIdentities)
    ? "MultipleIdentities"
    : error instanceof InteractionRequiredAuthError && error.message.includes(MSAL_ERROR_CODES.ConditionalAccessRule)
    ? "ConditionalAccessRule"
    : error instanceof BrowserAuthError && error.message.includes(MSAL_ERROR_CODES.IframeTimeout)
    ? "SilentFlowProblem"
    : "Unknown";
