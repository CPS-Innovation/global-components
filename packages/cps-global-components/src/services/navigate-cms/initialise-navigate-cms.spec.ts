import { initialiseNavigateCms, dispatchCmsNavigate } from "./initialise-navigate-cms";
import { CmsNavigateEvent } from "./CmsNavigateEvent";

describe("initialiseNavigateCms", () => {
  let mockWindow: Window;
  let mockOpen: jest.Mock;

  beforeEach(() => {
    mockOpen = jest.fn();
    mockWindow = { document: document.createElement("div"), open: mockOpen } as unknown as Window;
  });

  it("registers listener", () => {
    const addEventSpy = jest.spyOn(mockWindow.document, "addEventListener");
    initialiseNavigateCms({
      window: mockWindow,
      rootUrl: "https://example.com/global-components/test/cps-global-components.esm.js",
    });
    expect(addEventSpy).toHaveBeenCalledWith(CmsNavigateEvent.type, expect.anything());
  });

  it("opens correct URL for case action", () => {
    initialiseNavigateCms({
      window: mockWindow,
      rootUrl: "https://example.com/global-components/test/cps-global-components.esm.js",
    });

    mockWindow.document.dispatchEvent(new CmsNavigateEvent({ action: "case", caseId: 123 }));

    expect(mockOpen).toHaveBeenCalledWith("https://example.com/global-components/navigate-cms?caseId=123", "_blank", expect.stringContaining("width=500"));
  });

  it("opens correct URL for task action", () => {
    initialiseNavigateCms({
      window: mockWindow,
      rootUrl: "https://example.com/global-components/test/cps-global-components.esm.js",
    });

    mockWindow.document.dispatchEvent(new CmsNavigateEvent({ action: "task", caseId: 123, taskId: 456 }));

    expect(mockOpen).toHaveBeenCalledWith("https://example.com/global-components/navigate-cms?caseId=123&taskId=456", "_blank", expect.stringContaining("width=500"));
  });
});

describe("dispatchCmsNavigate", () => {
  it("dispatches a cms-navigate event with case action", () => {
    const handler = jest.fn();
    document.addEventListener(CmsNavigateEvent.type, handler);

    dispatchCmsNavigate(42);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CmsNavigateEvent;
    expect(event.detail).toEqual({ action: "case", caseId: 42 });

    document.removeEventListener(CmsNavigateEvent.type, handler);
  });
});
