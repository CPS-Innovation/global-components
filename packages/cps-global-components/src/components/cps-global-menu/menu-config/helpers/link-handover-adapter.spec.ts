jest.mock("../../../../services/application-flags/is-outsystems-app");
jest.mock("cps-global-os-handover");

import { linkHandoverAdapter } from "./link-handover-adapter";
import { isOutSystemsApp } from "../../../../services/application-flags/is-outsystems-app";
import { createOutboundUrlDirect } from "cps-global-os-handover";
import { State } from "../../../../store/store";

const mockIsOutSystemsApp = isOutSystemsApp as jest.MockedFunction<typeof isOutSystemsApp>;
const mockCreateOutboundUrlDirect = createOutboundUrlDirect as jest.MockedFunction<typeof createOutboundUrlDirect>;

type AdapterParams = Pick<State, "flags" | "config" | "cmsSessionHint">;

const makeParams = (
  overrides: Partial<{
    isOutSystems: boolean;
    OS_HANDOVER_URL: string;
    COOKIE_HANDOVER_URL: string;
    cmsSessionHint: AdapterParams["cmsSessionHint"];
  }>,
): AdapterParams =>
  ({
    flags: { isOutSystems: overrides.isOutSystems ?? false },
    config: {
      OS_HANDOVER_URL: overrides.OS_HANDOVER_URL ?? "",
      COOKIE_HANDOVER_URL: overrides.COOKIE_HANDOVER_URL ?? "",
    },
    cmsSessionHint: overrides.cmsSessionHint ?? { found: false, error: {} as Error },
  }) as any;

describe("linkHandoverAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return identity function when in OutSystems", () => {
    const adapt = linkHandoverAdapter(
      makeParams({
        isOutSystems: true,
        OS_HANDOVER_URL: "https://handover.example.com",
        COOKIE_HANDOVER_URL: "https://cookie.example.com",
      }),
    );

    expect(adapt("https://some-url.com/page")).toBe("https://some-url.com/page");
    expect(mockIsOutSystemsApp).not.toHaveBeenCalled();
    expect(mockCreateOutboundUrlDirect).not.toHaveBeenCalled();
  });

  describe("when not in OutSystems", () => {
    it("should return URL unchanged when target is not an OutSystems app", () => {
      mockIsOutSystemsApp.mockReturnValue(false);

      const adapt = linkHandoverAdapter(
        makeParams({
          OS_HANDOVER_URL: "https://handover.example.com",
          COOKIE_HANDOVER_URL: "https://cookie.example.com",
        }),
      );

      expect(adapt("https://regular-app.com/page")).toBe("https://regular-app.com/page");
      expect(mockCreateOutboundUrlDirect).not.toHaveBeenCalled();
    });

    it("should return URL unchanged when OS_HANDOVER_URL or COOKIE_HANDOVER_URL is empty", () => {
      mockIsOutSystemsApp.mockReturnValue(true);

      const adapt = linkHandoverAdapter(
        makeParams({
          OS_HANDOVER_URL: "",
          COOKIE_HANDOVER_URL: "",
        }),
      );

      expect(adapt("https://os-app.com/page")).toBe("https://os-app.com/page");
      expect(mockIsOutSystemsApp).toHaveBeenCalledWith({ location: { href: "https://os-app.com/page" } });
      expect(mockCreateOutboundUrlDirect).not.toHaveBeenCalled();
    });

    it("should go via auth handover when target is an OutSystems app and handover URLs are configured", () => {
      mockIsOutSystemsApp.mockReturnValue(true);
      mockCreateOutboundUrlDirect.mockReturnValue(
        "https://cookie.example.com?r=https://handover.example.com?stage=os-cookie-return&r=https://os-app.com/page",
      );

      const adapt = linkHandoverAdapter(
        makeParams({
          OS_HANDOVER_URL: "https://handover.example.com",
          COOKIE_HANDOVER_URL: "https://cookie.example.com",
        }),
      );

      const result = adapt("https://os-app.com/page");

      expect(mockIsOutSystemsApp).toHaveBeenCalledWith({ location: { href: "https://os-app.com/page" } });
      expect(mockCreateOutboundUrlDirect).toHaveBeenCalledWith({
        cookieHandoverUrl: "https://cookie.example.com",
        handoverUrl: "https://handover.example.com",
        targetUrl: "https://os-app.com/page",
      });
      expect(result).toBe("https://cookie.example.com?r=https://handover.example.com?stage=os-cookie-return&r=https://os-app.com/page");
    });

    it("should use cmsSessionHint.handoverEndpoint when available as cookieHandoverUrl", () => {
      mockIsOutSystemsApp.mockReturnValue(true);
      mockCreateOutboundUrlDirect.mockReturnValue(
        "https://proxy-cookie.example.com?r=https://handover.example.com?stage=os-cookie-return&r=https://os-app.com/page",
      );

      const adapt = linkHandoverAdapter(
        makeParams({
          OS_HANDOVER_URL: "https://handover.example.com",
          COOKIE_HANDOVER_URL: "https://cookie.example.com",
          cmsSessionHint: {
            found: true,
            result: {
              cmsDomains: ["example.com"],
              isProxySession: true,
              handoverEndpoint: "https://proxy-cookie.example.com",
            },
          },
        }),
      );

      const result = adapt("https://os-app.com/page");

      expect(mockCreateOutboundUrlDirect).toHaveBeenCalledWith({
        cookieHandoverUrl: "https://proxy-cookie.example.com",
        handoverUrl: "https://handover.example.com",
        targetUrl: "https://os-app.com/page",
      });
      expect(result).toBe(
        "https://proxy-cookie.example.com?r=https://handover.example.com?stage=os-cookie-return&r=https://os-app.com/page",
      );
    });
  });
});
