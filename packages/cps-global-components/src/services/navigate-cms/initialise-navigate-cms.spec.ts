import { initialiseNavigateCms, dispatchCmsNavigate } from "./initialise-navigate-cms";
import { CmsNavigateEvent } from "./CmsNavigateEvent";

describe("initialiseNavigateCms", () => {
  let openSpy: jest.SpyInstance;

  beforeEach(() => {
    openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it("does not register listener when preview flag is off", () => {
    const addEventSpy = jest.spyOn(document, "addEventListener");
    initialiseNavigateCms({
      rootUrl: "https://example.com/global-components/test/cps-global-components.esm.js",
      preview: { found: true, result: {} },
    });
    expect(addEventSpy).not.toHaveBeenCalledWith("cms-navigate", expect.anything());
    addEventSpy.mockRestore();
  });

  it("registers listener when preview flag is on", () => {
    const addEventSpy = jest.spyOn(document, "addEventListener");
    initialiseNavigateCms({
      rootUrl: "https://example.com/global-components/test/cps-global-components.esm.js",
      preview: { found: true, result: { openCaseInCms: true } },
    });
    expect(addEventSpy).toHaveBeenCalledWith("cms-navigate", expect.anything());
    addEventSpy.mockRestore();
  });

  it("opens correct URL for case action", () => {
    initialiseNavigateCms({
      rootUrl: "https://example.com/global-components/test/cps-global-components.esm.js",
      preview: { found: true, result: { openCaseInCms: true } },
    });

    document.dispatchEvent(new CmsNavigateEvent({ action: "case", caseId: 123 }));

    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/global-components/navigate-cms?caseId=123",
      "_blank",
      "width=500,height=300",
    );
  });

  it("opens correct URL for task action", () => {
    initialiseNavigateCms({
      rootUrl: "https://example.com/global-components/test/cps-global-components.esm.js",
      preview: { found: true, result: { openCaseInCms: true } },
    });

    document.dispatchEvent(new CmsNavigateEvent({ action: "task", caseId: 123, taskId: 456 }));

    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/global-components/navigate-cms?caseId=123&taskId=456",
      "_blank",
      "width=500,height=300",
    );
  });
});

describe("dispatchCmsNavigate", () => {
  it("dispatches a cms-navigate event with case action", () => {
    const handler = jest.fn();
    document.addEventListener("cms-navigate", handler);

    dispatchCmsNavigate(42);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CmsNavigateEvent;
    expect(event.detail).toEqual({ action: "case", caseId: 42 });

    document.removeEventListener("cms-navigate", handler);
  });
});
