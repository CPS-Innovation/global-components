jest.mock("./mutations");

import { initialiseDomObservation } from "./initialise-dom-observation";
import { setupMutationObserver } from "./mutations";
import { FoundContext } from "../context/find-context";
import { Register } from "../../store/store";
import { DomTags } from "cps-global-configuration/dist/schema";

const mockSetupMutationObserver = setupMutationObserver as jest.MockedFunction<typeof setupMutationObserver>;

describe("initialise-dom-observation", () => {
  let mockWindow: Window;
  let mockRegister: Register;
  let mockObserver: MutationObserver;
  let resetDomObservation: ReturnType<typeof initialiseDomObservation>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockObserver = {
      observe: jest.fn(),
      disconnect: jest.fn(),
      takeRecords: jest.fn(),
    } as any;

    mockWindow = {
      document: {
        body: document.createElement("div"),
      },
    } as any;

    mockRegister = jest.fn();

    mockSetupMutationObserver.mockReturnValue(mockObserver);
  });

  describe("initialiseDomObservation", () => {
    it("should return a resetDomObservation function", () => {
      resetDomObservation = initialiseDomObservation({ window: mockWindow, registerToStore: mockRegister });

      expect(typeof resetDomObservation).toBe("function");
    });

    describe("when no domTags are found", () => {
      it("should not setup mutation observer", () => {
        const context: FoundContext = { found: false };
        resetDomObservation = initialiseDomObservation({ window: mockWindow, registerToStore: mockRegister });

        resetDomObservation({ context });

        expect(mockSetupMutationObserver).not.toHaveBeenCalled();
        expect(mockRegister).toHaveBeenCalledWith({ tags: {} });
      });

      it("should not setup mutation observer for empty domTags array", () => {
        const context: FoundContext = {
          found: true,
          domTags: [],
          contextIndex: 0,
          paths: ["test"],
          contexts: "test",
          tags: {},
          msalRedirectUrl: "foo",
        };
        resetDomObservation = initialiseDomObservation({ window: mockWindow, registerToStore: mockRegister });

        resetDomObservation({ context });

        expect(mockSetupMutationObserver).not.toHaveBeenCalled();
        expect(mockRegister).toHaveBeenCalledWith({ tags: {} });
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
        const context: FoundContext = {
          found: true,
          domTags: mockDomTags,
          contextIndex: 0,
          paths: ["test"],
          contexts: "test",
          tags: {},
          msalRedirectUrl: "foo",
        };
        resetDomObservation = initialiseDomObservation({ window: mockWindow, registerToStore: mockRegister });

        resetDomObservation({ context });

        expect(mockSetupMutationObserver).toHaveBeenCalledWith(mockWindow.document.body, mockDomTags, expect.any(Function));
      });

      it("should cache the context index and skip setup for same context", () => {
        const context: FoundContext = {
          found: true,
          domTags: mockDomTags,
          contextIndex: 5,
          paths: ["test"],
          contexts: "test",
          tags: {},
          msalRedirectUrl: "foo",
        };
        resetDomObservation = initialiseDomObservation({ window: mockWindow, registerToStore: mockRegister });

        // First call
        resetDomObservation({ context });
        expect(mockSetupMutationObserver).toHaveBeenCalledTimes(1);

        // Second call with same context index
        resetDomObservation({ context });
        expect(mockSetupMutationObserver).toHaveBeenCalledTimes(1); // Still only called once
        expect(mockRegister).toHaveBeenCalledTimes(1); // Only reset tags once
      });
    });

    describe("context changes", () => {
      it("should disconnect existing observer when context changes", () => {
        const context1: FoundContext = {
          found: true,
          domTags: [{ cssSelector: "[data-test]", regex: "test" }],
          contextIndex: 1,
          paths: ["test1"],
          contexts: "test1",
          tags: {},
          msalRedirectUrl: "foo",
        };

        const context2: FoundContext = {
          found: true,
          domTags: [{ cssSelector: "[data-new]", regex: "new" }],
          contextIndex: 2,
          paths: ["test2"],
          contexts: "test2",
          tags: {},
          msalRedirectUrl: "bar",
        };

        resetDomObservation = initialiseDomObservation({ window: mockWindow, registerToStore: mockRegister });

        // Setup first context
        resetDomObservation({ context: context1 });
        expect(mockObserver.disconnect).not.toHaveBeenCalled();

        // Change to different context
        resetDomObservation({ context: context2 });
        expect(mockObserver.disconnect).toHaveBeenCalled();
        expect(mockSetupMutationObserver).toHaveBeenCalledTimes(2);
      });

      it("should setup new observer when moving from no domTags to having domTags", () => {
        const contextWithoutTags: FoundContext = { found: false };
        const contextWithTags: FoundContext = {
          found: true,
          domTags: [{ cssSelector: "[data-new]", regex: "new" }],
          contextIndex: 3,
          paths: ["test"],
          contexts: "test",
          tags: {},
          msalRedirectUrl: "foo",
        };

        resetDomObservation = initialiseDomObservation({ window: mockWindow, registerToStore: mockRegister });

        // First call without domTags
        resetDomObservation({ context: contextWithoutTags });
        expect(mockSetupMutationObserver).not.toHaveBeenCalled();

        // Navigate to context with domTags
        resetDomObservation({ context: contextWithTags });
        expect(mockSetupMutationObserver).toHaveBeenCalledWith(mockWindow.document.body, contextWithTags.domTags, expect.any(Function));
      });

      it("should call register callback when mutation observer detects tags", () => {
        const context: FoundContext = {
          found: true,
          domTags: [{ cssSelector: "[data-test]", regex: 'data-test="(?<test>\\w+)"' }],
          contextIndex: 0,
          paths: ["test"],
          contexts: "test",
          tags: {},
          msalRedirectUrl: "foo",
        };

        // Capture the callback passed to setupMutationObserver
        let capturedCallback: ((tags: Record<string, string>) => void) | undefined;
        mockSetupMutationObserver.mockImplementation((_element, _domTags, callback) => {
          capturedCallback = callback;
          return mockObserver;
        });

        resetDomObservation = initialiseDomObservation({ window: mockWindow, registerToStore: mockRegister });
        resetDomObservation({ context });

        // Simulate mutation observer detecting tags
        const detectedTags = { test: "value123" };
        capturedCallback!(detectedTags);

        expect(mockRegister).toHaveBeenCalledWith({ tags: detectedTags });
      });
    });
  });
});
