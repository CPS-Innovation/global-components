import { setupMutationObserver } from "./mutations";
import { DomTags } from "cps-global-configuration/dist/schema";

describe("mutations", () => {
  let mockObserver: MutationObserver;
  let observeCallback: MutationCallback;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock MutationObserver
    mockObserver = {
      observe: jest.fn(),
      disconnect: jest.fn(),
      takeRecords: jest.fn(),
    } as any;

    global.MutationObserver = jest.fn(callback => {
      observeCallback = callback;
      return mockObserver;
    }) as any;
  });

  describe("setupMutationObserver", () => {
    const createMockElement = (html: string): Element => {
      const div = document.createElement("div");
      div.innerHTML = html;
      return div.firstElementChild || div;
    };

    it("should create and configure a MutationObserver", () => {
      const rootElement = document.createElement("div");
      const domTags: DomTags[] = [];
      const callback = jest.fn();

      setupMutationObserver(rootElement, domTags, callback);

      expect(global.MutationObserver).toHaveBeenCalledWith(expect.any(Function));
      expect(mockObserver.observe).toHaveBeenCalledWith(rootElement, {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
      });
    });

    it("should process initial DOM state and call callback with tags", () => {
      const rootElement = createMockElement(`
        <div data-user-id="123">
          <span data-session-id="abc">Content</span>
        </div>
      `);

      const domTags: DomTags[] = [
        {
          cssSelector: "[data-user-id]",
          regex: 'data-user-id="(?<userId>\\w+)"',
        },
        {
          cssSelector: "[data-session-id]",
          regex: 'data-session-id="(?<sessionId>\\w+)"',
        },
      ];

      const callback = jest.fn();

      setupMutationObserver(rootElement, domTags, callback);

      expect(callback).toHaveBeenCalledWith({
        userId: "123",
        sessionId: "abc",
      });
    });

    it("should return the mutation observer instance", () => {
      const rootElement = document.createElement("div");
      const domTags: DomTags[] = [];
      const callback = jest.fn();

      const result = setupMutationObserver(rootElement, domTags, callback);

      expect(result).toBe(mockObserver);
    });

    describe("mutation processing", () => {
      it("should process mutations and extract tags", () => {
        const rootElement = document.createElement("div");
        rootElement.setAttribute("data-test-id", "789");
        const domTags: DomTags[] = [
          {
            cssSelector: "[data-test-id]",
            regex: 'data-test-id="(?<testId>\\w+)"',
          },
        ];
        const callback = jest.fn();

        setupMutationObserver(rootElement, domTags, callback);
        jest.clearAllMocks(); // Clear initial callback

        const mutations: MutationRecord[] = [
          {
            type: "attributes",
            addedNodes: [] as any,
            removedNodes: [] as any,
            target: rootElement,
            attributeName: "data-test-id",
            attributeNamespace: null,
            nextSibling: null,
            oldValue: null,
            previousSibling: null,
          },
        ];

        observeCallback(mutations, mockObserver);

        expect(callback).toHaveBeenCalledWith({ testId: "789" });
      });

      it("should handle nested elements", () => {
        const rootElement = document.createElement("div");
        const domTags: DomTags[] = [
          {
            cssSelector: ".user-info",
            regex: 'class="user-info".*data-id="(?<userId>\\w+)"',
          },
        ];
        const callback = jest.fn();

        setupMutationObserver(rootElement, domTags, callback);
        jest.clearAllMocks();

        const newElement = createMockElement(`
          <div>
            <div class="user-info" data-id="456">User Info</div>
          </div>
        `);
        rootElement.appendChild(newElement);

        const mutations: MutationRecord[] = [
          {
            type: "childList",
            addedNodes: [newElement] as any,
            removedNodes: [] as any,
            target: rootElement,
            attributeName: null,
            attributeNamespace: null,
            nextSibling: null,
            oldValue: null,
            previousSibling: null,
          },
        ];

        observeCallback(mutations, mockObserver);

        expect(callback).toHaveBeenCalledWith({ userId: "456" });
      });

      it("should handle characterData mutations", () => {
        const rootElement = document.createElement("div");
        rootElement.setAttribute("data-test", "value");
        const textNode = document.createTextNode("test");
        rootElement.appendChild(textNode);
        
        const domTags: DomTags[] = [
          {
            cssSelector: "[data-test]",
            regex: 'data-test="(?<test>\\w+)"',
          },
        ];
        const callback = jest.fn();

        setupMutationObserver(rootElement, domTags, callback);
        jest.clearAllMocks();

        const mutations: MutationRecord[] = [
          {
            type: "characterData",
            addedNodes: [] as any,
            removedNodes: [] as any,
            target: textNode,
            attributeName: null,
            attributeNamespace: null,
            nextSibling: null,
            oldValue: null,
            previousSibling: null,
          },
        ];

        observeCallback(mutations, mockObserver);

        expect(callback).toHaveBeenCalledWith({ test: "value" });
      });

      it("should not call callback when no tags are found", () => {
        const rootElement = document.createElement("div");
        const domTags: DomTags[] = [
          {
            cssSelector: "[data-missing]",
            regex: 'data-missing="(?<missing>\\w+)"',
          },
        ];
        const callback = jest.fn();

        setupMutationObserver(rootElement, domTags, callback);
        jest.clearAllMocks();

        const newElement = createMockElement("<div>No matching attributes</div>");
        const mutations: MutationRecord[] = [
          {
            type: "childList",
            addedNodes: [newElement] as any,
            removedNodes: [] as any,
            target: rootElement,
            attributeName: null,
            attributeNamespace: null,
            nextSibling: null,
            oldValue: null,
            previousSibling: null,
          },
        ];

        observeCallback(mutations, mockObserver);

        expect(callback).not.toHaveBeenCalled();
      });

      it("should handle multiple mutations", () => {
        const rootElement = document.createElement("div");
        const domTags: DomTags[] = [
          {
            cssSelector: "[data-id]",
            regex: 'data-id="(?<id>\\w+)"',
          },
        ];
        const callback = jest.fn();

        setupMutationObserver(rootElement, domTags, callback);
        jest.clearAllMocks();

        const element1 = createMockElement('<div data-id="1">First</div>');
        const element2 = createMockElement('<div data-id="2">Second</div>');
        element1.setAttribute("data-id", "1");
        element2.setAttribute("data-id", "2");

        const mutations: MutationRecord[] = [
          {
            type: "attributes",
            addedNodes: [] as any,
            removedNodes: [] as any,
            target: element1,
            attributeName: "data-id",
            attributeNamespace: null,
            nextSibling: null,
            oldValue: null,
            previousSibling: null,
          },
          {
            type: "attributes",
            addedNodes: [] as any,
            removedNodes: [] as any,
            target: element2,
            attributeName: "data-id",
            attributeNamespace: null,
            nextSibling: null,
            oldValue: null,
            previousSibling: null,
          },
        ];

        observeCallback(mutations, mockObserver);

        expect(callback).toHaveBeenCalledWith({ id: "2" });
        expect(callback).toHaveBeenCalledTimes(1);
      });

      it("should match element itself if it matches selector", () => {
        const rootElement = document.createElement("div");
        const domTags: DomTags[] = [
          {
            cssSelector: "[data-root]",
            regex: 'data-root="(?<rootId>\\w+)"',
          },
        ];
        const callback = jest.fn();

        setupMutationObserver(rootElement, domTags, callback);
        jest.clearAllMocks();

        const newElement = createMockElement('<div data-root="root123">Root element</div>');
        newElement.setAttribute("data-root", "root123");

        const mutations: MutationRecord[] = [
          {
            type: "attributes",
            addedNodes: [] as any,
            removedNodes: [] as any,
            target: newElement,
            attributeName: "data-root",
            attributeNamespace: null,
            nextSibling: null,
            oldValue: null,
            previousSibling: null,
          },
        ];

        observeCallback(mutations, mockObserver);

        expect(callback).toHaveBeenCalledWith({ rootId: "root123" });
      });

    });
  });
});
