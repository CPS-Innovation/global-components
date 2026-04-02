jest.mock("arrive", () => {});

import { initialiseTabTitle, buildTitle } from "./initialise-tab-title";
import { SubscriptionFactory } from "../../../store/subscriptions/SubscriptionFactory";
import { Tags } from "../../context/Tags";

describe("buildTitle", () => {
  it("prepends the URN to a title", () => {
    expect(buildTitle("My Page", "URN123")).toBe("URN123 My Page");
  });

  it("returns just the URN when base title is empty", () => {
    expect(buildTitle("", "URN123")).toBe("URN123");
  });

  it("returns the base title when URN is undefined", () => {
    expect(buildTitle("My Page", undefined)).toBe("My Page");
  });
});

const makeDocument = (initialTitle: string) => {
  let backingTitle = initialTitle;
  let mutationCallback: MutationCallback | undefined;

  (global as any).MutationObserver = class {
    constructor(cb: MutationCallback) {
      mutationCallback = cb;
    }
    observe() {}
    disconnect() {}
  };

  const doc = {
    get title() {
      return backingTitle;
    },
    set title(val: string) {
      backingTitle = val;
    },
    // Mock arrive: capture the callback and fire it with a fake element
    arrive: (_selector: string, _opts: any, cb: (el: Element) => void) => {
      cb({} as Element);
    },
  } as unknown as Document;

  const simulateHostTitleChange = (newTitle: string) => {
    backingTitle = newTitle;
    mutationCallback?.([] as any, {} as any);
  };

  return { doc, simulateHostTitleChange };
};

type OnTagsChange = (tags: Tags | undefined) => void;

const setup = (doc: Document, previewEnabled: boolean) => {
  let onTagsChange: OnTagsChange;

  const subscribe = (...factories: SubscriptionFactory[]) => {
    const { handler } = factories[0]({} as any) as { type: "onChange"; handler: { handler: OnTagsChange } };
    onTagsChange = handler.handler;
  };

  initialiseTabTitle({
    document: doc,
    preview: previewEnabled ? { found: true, result: { tabTitleUrn: true } } : { found: false, error: new Error("off") },
    subscribe: subscribe as any,
  });

  return { onTagsChange: onTagsChange! };
};

describe("initialiseTabTitle", () => {
  it("prepends URN to the document title when tags arrive", () => {
    const { doc } = makeDocument("My Page");
    const { onTagsChange } = setup(doc, true);

    onTagsChange({ urn: "URN123" });

    expect(doc.title).toBe("URN123 My Page");
  });

  it("removes URN from the document title when tags lose the URN", () => {
    const { doc } = makeDocument("My Page");
    const { onTagsChange } = setup(doc, true);

    onTagsChange({ urn: "URN123" });
    expect(doc.title).toBe("URN123 My Page");

    onTagsChange({});
    expect(doc.title).toBe("My Page");
  });

  it("swaps URN when navigating from one case to another", () => {
    const { doc } = makeDocument("My Page");
    const { onTagsChange } = setup(doc, true);

    onTagsChange({ urn: "URN123" });
    expect(doc.title).toBe("URN123 My Page");

    onTagsChange({ urn: "URN456" });
    expect(doc.title).toBe("URN456 My Page");
  });

  it("does nothing when tags are undefined", () => {
    const { doc } = makeDocument("My Page");
    const { onTagsChange } = setup(doc, true);

    onTagsChange(undefined);
    expect(doc.title).toBe("My Page");
  });

  it("does not prepend URN when preview flag is disabled", () => {
    const { doc } = makeDocument("My Page");
    const { onTagsChange } = setup(doc, false);

    onTagsChange({ urn: "URN123" });
    expect(doc.title).toBe("My Page");
  });

  it("handles empty base title without trailing separator", () => {
    const { doc } = makeDocument("");
    const { onTagsChange } = setup(doc, true);

    onTagsChange({ urn: "URN123" });
    expect(doc.title).toBe("URN123");
  });

  it("re-applies URN when host app changes the title", () => {
    const { doc, simulateHostTitleChange } = makeDocument("Page One");
    const { onTagsChange } = setup(doc, true);

    onTagsChange({ urn: "URN123" });
    expect(doc.title).toBe("URN123 Page One");

    simulateHostTitleChange("Page Two");
    expect(doc.title).toBe("URN123 Page Two");
  });

  it("does not re-apply URN after it has been removed", () => {
    const { doc, simulateHostTitleChange } = makeDocument("Page One");
    const { onTagsChange } = setup(doc, true);

    onTagsChange({ urn: "URN123" });
    onTagsChange({});
    expect(doc.title).toBe("Page One");

    simulateHostTitleChange("Page Two");
    expect(doc.title).toBe("Page Two");
  });

  it("picks up host app title set after initialisation", () => {
    const { doc, simulateHostTitleChange } = makeDocument("");
    const { onTagsChange } = setup(doc, true);

    onTagsChange({ urn: "URN123" });
    expect(doc.title).toBe("URN123");

    simulateHostTitleChange("Late Title");
    expect(doc.title).toBe("URN123 Late Title");
  });
});
