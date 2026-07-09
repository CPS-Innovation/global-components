import { BrowserAuthError, InteractionRequiredAuthError } from "@azure/msal-browser";
import { getErrorType } from "./get-error-type";

describe("getErrorType", () => {
  it("should return MultipleIdentities for AADSTS16000", () => {
    const error = new InteractionRequiredAuthError("AADSTS16000");
    expect(getErrorType(error)).toBe("MultipleIdentities");
  });

  it("should return ConditionalAccessRule for AADSTS53003", () => {
    const error = new InteractionRequiredAuthError("AADSTS53003");
    expect(getErrorType(error)).toBe("ConditionalAccessRule");
  });

  it("should return StaleSidHint for AADSTS160021", () => {
    const error = new InteractionRequiredAuthError("AADSTS160021");
    expect(getErrorType(error)).toBe("StaleSidHint");
  });

  it("should return RefreshTokenExpired for refresh_token_expired", () => {
    const error = new InteractionRequiredAuthError("refresh_token_expired");
    expect(getErrorType(error)).toBe("RefreshTokenExpired");
  });

  it("should return NoAccountFound for no_account_error", () => {
    const error = new BrowserAuthError("no_account_error");
    expect(getErrorType(error)).toBe("NoAccountFound");
  });

  it("should return NoAccountFound for AADSTS50058 (no user signed in)", () => {
    const error = new InteractionRequiredAuthError("login_required: AADSTS50058: A silent sign-in request was sent but no user is signed in.");
    expect(getErrorType(error)).toBe("NoAccountFound");
  });

  it("should return SilentFlowProblem for monitor_window_timeout", () => {
    const error = new BrowserAuthError("monitor_window_timeout");
    expect(getErrorType(error)).toBe("SilentFlowProblem");
  });

  it("should return PostRequestFailed for post_request_failed", () => {
    const error = new BrowserAuthError("post_request_failed");
    expect(getErrorType(error)).toBe("PostRequestFailed");
  });

  it("should return NoNetworkConnectivity for no_network_connectivity", () => {
    const error = new BrowserAuthError("no_network_connectivity");
    expect(getErrorType(error)).toBe("NoNetworkConnectivity");
  });

  it("should return Unknown for unrecognised BrowserAuthError", () => {
    const error = new BrowserAuthError("something_else");
    expect(getErrorType(error)).toBe("Unknown");
  });

  it("should return Unknown for generic errors", () => {
    const error = new Error("something went wrong");
    expect(getErrorType(error)).toBe("Unknown");
  });
});
