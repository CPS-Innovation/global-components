jest.mock("../../../../../config/context/find-context");
jest.mock("./mutations");
jest.mock("./tags");

import { tryInitialiseDomObservation } from "./try-initialise-dom-observation";
import { findContext } from "../../../../../services/config/context/find-context";
import { setupMutationObserver } from "./mutations";
import { resetDomTags } from "./tags";
import { Config } from "cps-global-configuration";
import { DomTags } from "cps-global-configuration/dist/schema";

const mockFindContext = findContext as jest.MockedFunction<typeof findContext>;
const mockSetupMutationObserver = setupMutationObserver as jest.MockedFunction<typeof setupMutationObserver>;
const mockResetDomTags = resetDomTags as jest.MockedFunction<typeof resetDomTags>;

describe("try-initialise-dom-observation", () => {
  let mockConfig: Config;
  let mockWindow: Window;
  let mockCallback: jest.Mock;
  let mockObserver: MutationObserver;
  let navigateListeners: EventListener[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    navigateListeners = [];

    mockConfig = {
      CONTEXTS: [],
    } as Config;

    mockObserver = {
      observe: jest.fn(),
      disconnect: jest.fn(),
      takeRecords: jest.fn(),
    } as any;

    mockWindow = {
      document: {
        body: document.createElement("div"),
      },
      navigation: {
        addEventListener: jest.fn((event, listener) => {
          if (event === "navigate") {
            navigateListeners.push(listener);
          }
        }),
      },
    } as any;

    mockCallback = jest.fn();
  });

  describe("initialiseDomObservation", () => {
    it("should add navigation event listener", () => {
      mockFindContext.mockReturnValue({ found: false });

      tryInitialiseDomObservation(mockConfig, mockWindow, mockCallback);

      expect(mockWindow.navigation.addEventListener).toHaveBeenCalledWith("navigate", expect.any(Function));
    });

    it("should immediately call findContext and resetDomTags on initialisation", () => {
      mockFindContext.mockReturnValue({ found: false });

      tryInitialiseDomObservation(mockConfig, mockWindow, mockCallback);

      expect(mockFindContext).toHaveBeenCalledWith(mockConfig.CONTEXTS, mockWindow);
      expect(mockResetDomTags).toHaveBeenCalled();
    });

    describe("when no domTags are found", () => {
      it("should not setup mutation observer", () => {
        mockFindContext.mockReturnValue({ found: false });

        tryInitialiseDomObservation(mockConfig, mockWindow, mockCallback);

        expect(mockSetupMutationObserver).not.toHaveBeenCalled();
      });

      it("should not setup mutation observer for empty domTags array", () => {
        mockFindContext.mockReturnValue({
          found: true,
          domTags: [],
          contextIndex: 0,
          paths: ["test"],
          contexts: "test",
          tags: {},
          msalRedirectUrl: "foo",
        });

        tryInitialiseDomObservation(mockConfig, mockWindow, mockCallback);

        expect(mockSetupMutationObserver).not.toHaveBeenCalled();
      });
    });

    describe("when domTags are found", () => {
      const mockDomTags: DomTags[] = [
        {
          cssSelector: "[data-test]",
          regex: 'data-test="(?<test>\\w+)"',
        },
      ];

      it("should setup mutation observer", () => {
        mockFindContext.mockReturnValue({
          found: true,
          domTags: mockDomTags,
          contextIndex: 0,
          paths: ["test"],
          contexts: "test",
          tags: {},
          msalRedirectUrl: "foo",
        });
        mockSetupMutationObserver.mockReturnValue(mockObserver);

        tryInitialiseDomObservation(mockConfig, mockWindow, mockCallback);

        expect(mockSetupMutationObserver).toHaveBeenCalledWith(mockWindow.document.body, mockDomTags, mockCallback);
      });

      it("should cache the context index and skip setup for same context", () => {
        mockFindContext.mockReturnValue({
          found: true,
          domTags: mockDomTags,
          contextIndex: 5,
          paths: ["test"],
          contexts: "test",
          tags: {},
          msalRedirectUrl: "foo",
        });
        mockSetupMutationObserver.mockReturnValue(mockObserver);

        tryInitialiseDomObservation(mockConfig, mockWindow, mockCallback);

        // Trigger navigation event with same context
        navigateListeners[0]({} as Event);

        expect(mockSetupMutationObserver).toHaveBeenCalledTimes(1); // Only called once
        expect(mockResetDomTags).toHaveBeenCalledTimes(1); // Only called once
      });
    });

    describe("navigation event handling", () => {
      it("should call findContext on navigation events", () => {
        mockFindContext.mockReturnValue({ found: false });

        tryInitialiseDomObservation(mockConfig, mockWindow, mockCallback);
        expect(mockFindContext).toHaveBeenCalledTimes(1);

        // Trigger navigation event
        navigateListeners[0]({} as Event);

        expect(mockFindContext).toHaveBeenCalledTimes(2);
      });

      it("should call resetDomTags on navigation events", () => {
        mockFindContext.mockReturnValue({ found: false });

        tryInitialiseDomObservation(mockConfig, mockWindow, mockCallback);
        expect(mockResetDomTags).toHaveBeenCalledTimes(1);

        // Trigger navigation event
        navigateListeners[0]({} as Event);

        expect(mockResetDomTags).toHaveBeenCalledTimes(2);
      });

      it("should setup new observer when moving from no domTags to having domTags", () => {
        mockFindContext.mockReturnValue({ found: false });

        tryInitialiseDomObservation(mockConfig, mockWindow, mockCallback);
        expect(mockSetupMutationObserver).not.toHaveBeenCalled();

        // Navigate to context with domTags
        const mockDomTags: DomTags[] = [{ cssSelector: "[data-new]", regex: "new" }];
        mockFindContext.mockReturnValue({
          found: true,
          domTags: mockDomTags,
          contextIndex: 3,
          paths: ["test"],
          contexts: "test",
          tags: {},
          msalRedirectUrl: "foo",
        });
        mockSetupMutationObserver.mockReturnValue(mockObserver);
        navigateListeners[0]({} as Event);

        expect(mockSetupMutationObserver).toHaveBeenCalledWith(mockWindow.document.body, mockDomTags, mockCallback);
      });
    });
  });
});
