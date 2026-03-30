jest.mock("../../../../services/application-flags/is-outsystems-app");
jest.mock("cps-global-os-handover");

import { linkHandoverAdapter } from "./link-handover-adapter";
import { isOutSystemsApp } from "../../../../services/application-flags/is-outsystems-app";
import { createOutboundUrlDirect } from "cps-global-os-handover";
import { State } from "../../../../store/store";

const mockIsOutSystemsApp = isOutSystemsApp as jest.MockedFunction<typeof isOutSystemsApp>;
const mockCreateOutboundUrlDirect = createOutboundUrlDirect as jest.MockedFunction<typeof createOutboundUrlDirect>;

type AdapterParams = Pick<State, "flags" | "config">;

const makeParams = (
  overrides: Partial<{
    isOutSystems: boolean;
    origin: string;
    OS_HANDOVER_URL: string;
  }>,
): AdapterParams =>
  ({
    flags: { isOutSystems: overrides.isOutSystems ?? false, origin: overrides.origin ?? "https://auth-refresh-outbound-qa-notprod.cps.gov.uk" },
    config: {
      OS_HANDOVER_URL: overrides.OS_HANDOVER_URL ?? "",
    },
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
        }),
      );

      expect(adapt("https://regular-app.com/page")).toBe("https://regular-app.com/page");
      expect(mockCreateOutboundUrlDirect).not.toHaveBeenCalled();
    });

    it("should return URL unchanged when OS_HANDOVER_URL is empty", () => {
      mockIsOutSystemsApp.mockReturnValue(true);

      const adapt = linkHandoverAdapter(
        makeParams({
          OS_HANDOVER_URL: "",
        }),
      );

      expect(adapt("https://os-app.com/page")).toBe("https://os-app.com/page");
      expect(mockIsOutSystemsApp).toHaveBeenCalledWith({ location: { href: "https://os-app.com/page" } });
      expect(mockCreateOutboundUrlDirect).not.toHaveBeenCalled();
    });

    it("should derive cookie handover URL from origin", () => {
      mockIsOutSystemsApp.mockReturnValue(true);
      mockCreateOutboundUrlDirect.mockReturnValue(
        "https://auth-refresh-outbound-qa-notprod.cps.gov.uk/auth-refresh-outbound?r=https://handover.example.com?stage=os-cookie-return&r=https://os-app.com/page",
      );

      const adapt = linkHandoverAdapter(
        makeParams({
          OS_HANDOVER_URL: "https://handover.example.com",
          origin: "https://auth-refresh-outbound-qa-notprod.cps.gov.uk",
        }),
      );

      const result = adapt("https://os-app.com/page");

      expect(mockIsOutSystemsApp).toHaveBeenCalledWith({ location: { href: "https://os-app.com/page" } });
      expect(mockCreateOutboundUrlDirect).toHaveBeenCalledWith({
        cookieHandoverUrl: "https://auth-refresh-outbound-qa-notprod.cps.gov.uk/auth-refresh-outbound",
        handoverUrl: "https://handover.example.com",
        targetUrl: "https://os-app.com/page",
      });
      expect(result).toBe("https://auth-refresh-outbound-qa-notprod.cps.gov.uk/auth-refresh-outbound?r=https://handover.example.com?stage=os-cookie-return&r=https://os-app.com/page");
    });
  });
});
