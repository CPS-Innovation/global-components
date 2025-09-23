import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import { handleForcedRedirect } from "./handle-forced-redirect";
import { stages, paramKeys } from "../core/constants";

describe("handleForcedRedirect", () => {
  let mockWindow: any;

  beforeEach(() => {
    mockWindow = {
      location: {
        href: "https://example.com/page",
        replace: jest.fn(),
      },
      history: {
        replaceState: jest.fn(),
      },
    };
  });

  describe("when stage is OS_FORCED_AUTH_RETURN", () => {
    test("removes stage parameter and updates history state", () => {
      mockWindow.location.href = `https://example.com/page?${paramKeys.STAGE}=${stages.OS_FORCED_AUTH_RETURN}&foo=bar`;

      const result = handleForcedRedirect({
        window: mockWindow,
        handoverUrl: "https://handover.example.com/auth",
      });

      expect(result).toBe(false);
      expect(mockWindow.history.replaceState).toHaveBeenCalledWith(
        {},
        "",
        expect.any(URL)
      );

      const replacedUrl = mockWindow.history.replaceState.mock.calls[0][2];
      expect(replacedUrl.searchParams.has(paramKeys.STAGE)).toBe(false);
      expect(replacedUrl.searchParams.get("foo")).toBe("bar");
      expect(mockWindow.location.replace).not.toHaveBeenCalled();
    });

    test("preserves other query parameters when removing stage", () => {
      mockWindow.location.href = `https://example.com/page?param1=value1&${paramKeys.STAGE}=${stages.OS_FORCED_AUTH_RETURN}&param2=value2`;

      const result = handleForcedRedirect({
        window: mockWindow,
        handoverUrl: "https://handover.example.com/auth",
      });

      expect(result).toBe(false);

      const replacedUrl = mockWindow.history.replaceState.mock.calls[0][2];
      expect(replacedUrl.searchParams.get("param1")).toBe("value1");
      expect(replacedUrl.searchParams.get("param2")).toBe("value2");
      expect(replacedUrl.searchParams.has(paramKeys.STAGE)).toBe(false);
    });
  });

  describe("when stage is not OS_FORCED_AUTH_RETURN", () => {
    test("redirects to handover URL with correct parameters", () => {
      mockWindow.location.href = "https://example.com/page?foo=bar";

      const result = handleForcedRedirect({
        window: mockWindow,
        handoverUrl: "https://handover.example.com/auth",
      });

      expect(result).toBe(true);
      expect(mockWindow.history.replaceState).not.toHaveBeenCalled();
      expect(mockWindow.location.replace).toHaveBeenCalledTimes(1);

      const redirectUrl = new URL(mockWindow.location.replace.mock.calls[0][0]);
      expect(redirectUrl.origin + redirectUrl.pathname).toBe("https://handover.example.com/auth");
      expect(redirectUrl.searchParams.get(paramKeys.STAGE)).toBe(stages.OS_OUTBOUND);

      const returnUrl = new URL(redirectUrl.searchParams.get(paramKeys.R)!);
      expect(returnUrl.origin + returnUrl.pathname).toBe("https://example.com/page");
      expect(returnUrl.searchParams.get(paramKeys.STAGE)).toBe(stages.OS_FORCED_AUTH_RETURN);
      expect(returnUrl.searchParams.get("foo")).toBe("bar");
    });

    test("preserves existing query parameters in return URL", () => {
      mockWindow.location.href = "https://example.com/page?param1=value1&param2=value2";

      const result = handleForcedRedirect({
        window: mockWindow,
        handoverUrl: "https://handover.example.com/auth",
      });

      expect(result).toBe(true);

      const redirectUrl = new URL(mockWindow.location.replace.mock.calls[0][0]);
      const returnUrl = new URL(redirectUrl.searchParams.get(paramKeys.R)!);

      expect(returnUrl.searchParams.get("param1")).toBe("value1");
      expect(returnUrl.searchParams.get("param2")).toBe("value2");
      expect(returnUrl.searchParams.get(paramKeys.STAGE)).toBe(stages.OS_FORCED_AUTH_RETURN);
    });

    test("handles URLs with no existing query parameters", () => {
      mockWindow.location.href = "https://example.com/page";

      const result = handleForcedRedirect({
        window: mockWindow,
        handoverUrl: "https://handover.example.com/auth",
      });

      expect(result).toBe(true);

      const redirectUrl = new URL(mockWindow.location.replace.mock.calls[0][0]);
      expect(redirectUrl.searchParams.get(paramKeys.STAGE)).toBe(stages.OS_OUTBOUND);

      const returnUrl = new URL(redirectUrl.searchParams.get(paramKeys.R)!);
      expect(returnUrl.origin + returnUrl.pathname).toBe("https://example.com/page");
      expect(returnUrl.searchParams.get(paramKeys.STAGE)).toBe(stages.OS_FORCED_AUTH_RETURN);
    });

    test("handles different stage parameter values", () => {
      mockWindow.location.href = `https://example.com/page?${paramKeys.STAGE}=some-other-stage`;

      const result = handleForcedRedirect({
        window: mockWindow,
        handoverUrl: "https://handover.example.com/auth",
      });

      expect(result).toBe(true);
      expect(mockWindow.location.replace).toHaveBeenCalled();

      const redirectUrl = new URL(mockWindow.location.replace.mock.calls[0][0]);
      const returnUrl = new URL(redirectUrl.searchParams.get(paramKeys.R)!);
      expect(returnUrl.searchParams.get(paramKeys.STAGE)).toBe(stages.OS_FORCED_AUTH_RETURN);
    });

    test("handles handover URLs with existing query parameters", () => {
      mockWindow.location.href = "https://example.com/page";

      const result = handleForcedRedirect({
        window: mockWindow,
        handoverUrl: "https://handover.example.com/auth?existing=param",
      });

      expect(result).toBe(true);

      const redirectUrl = new URL(mockWindow.location.replace.mock.calls[0][0]);
      expect(redirectUrl.searchParams.get("existing")).toBe("param");
      expect(redirectUrl.searchParams.get(paramKeys.STAGE)).toBe(stages.OS_OUTBOUND);
      expect(redirectUrl.searchParams.has(paramKeys.R)).toBe(true);
    });
  });

  describe("edge cases", () => {
    test("handles URLs with hash fragments", () => {
      mockWindow.location.href = "https://example.com/page#section?foo=bar";

      const result = handleForcedRedirect({
        window: mockWindow,
        handoverUrl: "https://handover.example.com/auth",
      });

      expect(result).toBe(true);

      const redirectUrl = new URL(mockWindow.location.replace.mock.calls[0][0]);
      const returnUrl = new URL(redirectUrl.searchParams.get(paramKeys.R)!);
      expect(returnUrl.href).toContain("#section");
    });

    test("handles complex URLs with special characters", () => {
      mockWindow.location.href = "https://example.com/page?search=hello%20world&filter=%26%3D%3F";

      const result = handleForcedRedirect({
        window: mockWindow,
        handoverUrl: "https://handover.example.com/auth",
      });

      expect(result).toBe(true);

      const redirectUrl = new URL(mockWindow.location.replace.mock.calls[0][0]);
      const returnUrl = new URL(redirectUrl.searchParams.get(paramKeys.R)!);
      expect(returnUrl.searchParams.get("search")).toBe("hello world");
      expect(returnUrl.searchParams.get("filter")).toBe("&=?");
    });
  });
});