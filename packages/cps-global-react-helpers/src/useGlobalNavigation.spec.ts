import { renderHook } from "@testing-library/react";
import { useNavigate } from "react-router-dom";
import { useGlobalNavigation } from "./useGlobalNavigation";
import { GLOBAL_EVENT_NAME } from "cps-global-core";

jest.mock("react-router-dom", () => ({
  useNavigate: jest.fn(),
}));

describe("useGlobalNavigation", () => {
  let mockNavigate: jest.Mock;
  let addEventListenerSpy: jest.SpyInstance;
  let removeEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    mockNavigate = jest.fn();
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);

    addEventListenerSpy = jest.spyOn(window, "addEventListener");
    removeEventListenerSpy = jest.spyOn(window, "removeEventListener");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should register event listener on mount", () => {
    renderHook(() => useGlobalNavigation());

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      GLOBAL_EVENT_NAME,
      expect.any(Function)
    );
  });

  it("should navigate when event is dispatched", () => {
    renderHook(() => useGlobalNavigation());

    const event = new CustomEvent(GLOBAL_EVENT_NAME, {
      detail: "/test-route",
    });
    window.dispatchEvent(event);

    expect(mockNavigate).toHaveBeenCalledWith("/test-route");
  });

  it("should handle multiple navigation events", () => {
    renderHook(() => useGlobalNavigation());

    const routes = ["/route1", "/route2", "/route3"];
    routes.forEach((route) => {
      const event = new CustomEvent(GLOBAL_EVENT_NAME, {
        detail: route,
      });
      window.dispatchEvent(event);
    });

    expect(mockNavigate).toHaveBeenCalledTimes(3);
    expect(mockNavigate).toHaveBeenNthCalledWith(1, "/route1");
    expect(mockNavigate).toHaveBeenNthCalledWith(2, "/route2");
    expect(mockNavigate).toHaveBeenNthCalledWith(3, "/route3");
  });

  it("should remove event listener on unmount", () => {
    const { unmount } = renderHook(() => useGlobalNavigation());

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      GLOBAL_EVENT_NAME,
      expect.any(Function)
    );
  });

  it("should not navigate after unmount", () => {
    const { unmount } = renderHook(() => useGlobalNavigation());

    unmount();

    const event = new CustomEvent(GLOBAL_EVENT_NAME, {
      detail: "/test-route",
    });
    window.dispatchEvent(event);

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
