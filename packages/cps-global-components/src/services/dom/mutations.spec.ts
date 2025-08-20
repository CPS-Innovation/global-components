// jest.mock("./tags");
// import { setupMutationObserver } from "./mutations";
// import { DomTags } from "cps-global-configuration/dist/schema";

// describe("mutations", () => {
//   let mockObserver: MutationObserver;
//   let observeCallback: MutationCallback;

//   beforeEach(() => {
//     jest.clearAllMocks();

//     // Mock MutationObserver
//     mockObserver = {
//       observe: jest.fn(),
//       disconnect: jest.fn(),
//       takeRecords: jest.fn(),
//     } as any;

//     global.MutationObserver = jest.fn(callback => {
//       observeCallback = callback;
//       return mockObserver;
//     }) as any;
//   });

//   describe("setupMutationObserver", () => {
//     const createMockElement = (html: string): Element => {
//       const div = document.createElement("div");
//       div.innerHTML = html;
//       return div.firstElementChild || div;
//     };

//     it("should create and configure a MutationObserver", () => {
//       const rootElement = document.createElement("div");
//       const domTags: DomTags[] = [];
//       const callback = jest.fn();

//       setupMutationObserver(rootElement, domTags, callback);

//       expect(global.MutationObserver).toHaveBeenCalledWith(expect.any(Function));
//       expect(mockObserver.observe).toHaveBeenCalledWith(rootElement, {
//         childList: true,
//         subtree: true,
//       });
//     });

//     it("should process initial DOM state and cache tags", () => {
//       const rootElement = createMockElement(`
//         <div data-user-id="123">
//           <span data-session-id="abc">Content</span>
//         </div>
//       `);

//       const domTags: DomTags[] = [
//         {
//           cssSelector: "[data-user-id]",
//           regex: 'data-user-id="(?<userId>\\w+)"',
//         },
//         {
//           cssSelector: "[data-session-id]",
//           regex: 'data-session-id="(?<sessionId>\\w+)"',
//         },
//       ];

//       const callback = jest.fn();

//       setupMutationObserver(rootElement, domTags, callback);

//       expect(mockCacheDomTags).toHaveBeenCalledWith({
//         userId: "123",
//         sessionId: "abc",
//       });
//     });

//     it("should return the mutation observer instance", () => {
//       const rootElement = document.createElement("div");
//       const domTags: DomTags[] = [];
//       const callback = jest.fn();

//       const result = setupMutationObserver(rootElement, domTags, callback);

//       expect(result).toBe(mockObserver);
//     });

//     describe("mutation processing", () => {
//       it("should process added nodes and extract tags", () => {
//         const rootElement = document.createElement("div");
//         const domTags: DomTags[] = [
//           {
//             cssSelector: "[data-test-id]",
//             regex: 'data-test-id="(?<testId>\\w+)"',
//           },
//         ];
//         const callback = jest.fn();

//         setupMutationObserver(rootElement, domTags, callback);

//         const newElement = createMockElement('<div data-test-id="789">New content</div>');
//         const mutations: MutationRecord[] = [
//           {
//             type: "childList",
//             addedNodes: [newElement] as any,
//             removedNodes: [] as any,
//             target: rootElement,
//             attributeName: null,
//             attributeNamespace: null,
//             nextSibling: null,
//             oldValue: null,
//             previousSibling: null,
//           },
//         ];

//         observeCallback(mutations, mockObserver);

//         expect(mockCacheDomTags).toHaveBeenCalledWith({ testId: "789" });
//         expect(callback).toHaveBeenCalled();
//       });

//       it("should handle nested elements", () => {
//         const rootElement = document.createElement("div");
//         const domTags: DomTags[] = [
//           {
//             cssSelector: ".user-info",
//             regex: 'class="user-info".*data-id="(?<userId>\\w+)"',
//           },
//         ];
//         const callback = jest.fn();

//         setupMutationObserver(rootElement, domTags, callback);

//         const newElement = createMockElement(`
//           <div>
//             <div class="user-info" data-id="456">User Info</div>
//           </div>
//         `);

//         const mutations: MutationRecord[] = [
//           {
//             type: "childList",
//             addedNodes: [newElement] as any,
//             removedNodes: [] as any,
//             target: rootElement,
//             attributeName: null,
//             attributeNamespace: null,
//             nextSibling: null,
//             oldValue: null,
//             previousSibling: null,
//           },
//         ];

//         observeCallback(mutations, mockObserver);

//         expect(mockCacheDomTags).toHaveBeenCalledWith({ userId: "456" });
//         expect(callback).toHaveBeenCalled();
//       });

//       it.only("should ignore non-childList mutations", () => {
//         const rootElement = document.createElement("div");
//         const domTags: DomTags[] = [];
//         const callback = jest.fn();

//         setupMutationObserver(rootElement, domTags, callback);

//         const mutations: MutationRecord[] = [
//           {
//             type: "attributes",
//             addedNodes: [] as any,
//             removedNodes: [] as any,
//             target: rootElement,
//             attributeName: "class",
//             attributeNamespace: null,
//             nextSibling: null,
//             oldValue: null,
//             previousSibling: null,
//           },
//         ];

//         jest.clearAllMocks();
//         observeCallback(mutations, mockObserver);

//         expect(mockCacheDomTags).not.toHaveBeenCalled();
//         expect(callback).not.toHaveBeenCalled();
//       });

//       it("should ignore non-element nodes", () => {
//         const rootElement = document.createElement("div");
//         const domTags: DomTags[] = [];
//         const callback = jest.fn();

//         setupMutationObserver(rootElement, domTags, callback);

//         const textNode = document.createTextNode("Some text");
//         const mutations: MutationRecord[] = [
//           {
//             type: "childList",
//             addedNodes: [textNode] as any,
//             removedNodes: [] as any,
//             target: rootElement,
//             attributeName: null,
//             attributeNamespace: null,
//             nextSibling: null,
//             oldValue: null,
//             previousSibling: null,
//           },
//         ];

//         jest.clearAllMocks();
//         observeCallback(mutations, mockObserver);

//         expect(mockCacheDomTags).toHaveBeenCalledWith({});
//         expect(callback).not.toHaveBeenCalled();
//       });

//       it("should not call callback when no tags are found", () => {
//         const rootElement = document.createElement("div");
//         const domTags: DomTags[] = [
//           {
//             cssSelector: "[data-missing]",
//             regex: 'data-missing="(?<missing>\\w+)"',
//           },
//         ];
//         const callback = jest.fn();

//         setupMutationObserver(rootElement, domTags, callback);

//         const newElement = createMockElement("<div>No matching attributes</div>");
//         const mutations: MutationRecord[] = [
//           {
//             type: "childList",
//             addedNodes: [newElement] as any,
//             removedNodes: [] as any,
//             target: rootElement,
//             attributeName: null,
//             attributeNamespace: null,
//             nextSibling: null,
//             oldValue: null,
//             previousSibling: null,
//           },
//         ];

//         jest.clearAllMocks();
//         observeCallback(mutations, mockObserver);

//         expect(mockCacheDomTags).toHaveBeenCalledWith({});
//         expect(callback).not.toHaveBeenCalled();
//       });

//       it("should handle multiple mutations", () => {
//         const rootElement = document.createElement("div");
//         const domTags: DomTags[] = [
//           {
//             cssSelector: "[data-id]",
//             regex: 'data-id="(?<id>\\w+)"',
//           },
//         ];
//         const callback = jest.fn();

//         setupMutationObserver(rootElement, domTags, callback);

//         const element1 = createMockElement('<div data-id="1">First</div>');
//         const element2 = createMockElement('<div data-id="2">Second</div>');

//         const mutations: MutationRecord[] = [
//           {
//             type: "childList",
//             addedNodes: [element1] as any,
//             removedNodes: [] as any,
//             target: rootElement,
//             attributeName: null,
//             attributeNamespace: null,
//             nextSibling: null,
//             oldValue: null,
//             previousSibling: null,
//           },
//           {
//             type: "childList",
//             addedNodes: [element2] as any,
//             removedNodes: [] as any,
//             target: rootElement,
//             attributeName: null,
//             attributeNamespace: null,
//             nextSibling: null,
//             oldValue: null,
//             previousSibling: null,
//           },
//         ];

//         jest.clearAllMocks();
//         observeCallback(mutations, mockObserver);

//         expect(mockCacheDomTags).toHaveBeenCalledWith({ id: "2" });
//         expect(callback).toHaveBeenCalledTimes(1);
//       });

//       it("should match element itself if it matches selector", () => {
//         const rootElement = document.createElement("div");
//         const domTags: DomTags[] = [
//           {
//             cssSelector: "[data-root]",
//             regex: 'data-root="(?<rootId>\\w+)"',
//           },
//         ];
//         const callback = jest.fn();

//         setupMutationObserver(rootElement, domTags, callback);

//         const newElement = createMockElement('<div data-root="root123">Root element</div>');
//         const mutations: MutationRecord[] = [
//           {
//             type: "childList",
//             addedNodes: [newElement] as any,
//             removedNodes: [] as any,
//             target: rootElement,
//             attributeName: null,
//             attributeNamespace: null,
//             nextSibling: null,
//             oldValue: null,
//             previousSibling: null,
//           },
//         ];

//         jest.clearAllMocks();
//         observeCallback(mutations, mockObserver);

//         expect(mockCacheDomTags).toHaveBeenCalledWith({ rootId: "root123" });
//         expect(callback).toHaveBeenCalled();
//       });
//     });
//   });
// });
