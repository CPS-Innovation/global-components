import { initialiseTabTitle, buildTitle } from "./initialise-tab-title";

describe("buildTitle", () => {
  it("prepends the URN to a title", () => {
    expect(buildTitle("My Page", "URN123")).toBe("URN123 \u2013 My Page");
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

  return {
    get title() {
      return backingTitle;
    },
    set title(val: string) {
      backingTitle = val;
    },
  } as unknown as Document;
};

describe("initialiseTabTitle", () => {
  const enabled = () => true;
  const disabled = () => false;

  it("prepends URN to the document title when tags arrive", () => {
    const doc = makeDocument("My Page");
    const { onTagsChange } = initialiseTabTitle({ document: doc, isEnabled: enabled });

    onTagsChange({ urn: "URN123" });

    expect(doc.title).toBe("URN123 \u2013 My Page");
  });

  it("removes URN from the document title when tags lose the URN", () => {
    const doc = makeDocument("My Page");
    const { onTagsChange } = initialiseTabTitle({ document: doc, isEnabled: enabled });

    onTagsChange({ urn: "URN123" });
    expect(doc.title).toBe("URN123 \u2013 My Page");

    onTagsChange({});
    expect(doc.title).toBe("My Page");
  });

  it("swaps URN when navigating from one case to another", () => {
    const doc = makeDocument("My Page");
    const { onTagsChange } = initialiseTabTitle({ document: doc, isEnabled: enabled });

    onTagsChange({ urn: "URN123" });
    expect(doc.title).toBe("URN123 \u2013 My Page");

    onTagsChange({ urn: "URN456" });
    expect(doc.title).toBe("URN456 \u2013 My Page");
  });

  it("picks up host app title changes on next tags update", () => {
    const doc = makeDocument("Page One");
    const { onTagsChange } = initialiseTabTitle({ document: doc, isEnabled: enabled });

    onTagsChange({ urn: "URN123" });
    expect(doc.title).toBe("URN123 \u2013 Page One");

    // Host app changes title underneath us
    doc.title = "Page Two";

    // Next tags change picks up the new base title
    onTagsChange({ urn: "URN456" });
    expect(doc.title).toBe("URN456 \u2013 Page Two");
  });

  it("does nothing when tags are undefined", () => {
    const doc = makeDocument("My Page");
    const { onTagsChange } = initialiseTabTitle({ document: doc, isEnabled: enabled });

    onTagsChange(undefined);
    expect(doc.title).toBe("My Page");
  });

  it("does not prepend URN when preview flag is disabled", () => {
    const doc = makeDocument("My Page");
    const { onTagsChange } = initialiseTabTitle({ document: doc, isEnabled: disabled });

    onTagsChange({ urn: "URN123" });
    expect(doc.title).toBe("My Page");
  });

  it("handles empty base title without trailing separator", () => {
    const doc = makeDocument("");
    const { onTagsChange } = initialiseTabTitle({ document: doc, isEnabled: enabled });

    onTagsChange({ urn: "URN123" });
    expect(doc.title).toBe("URN123");
  });

  it("picks up host app title set after initialisation", () => {
    const doc = makeDocument("");
    const { onTagsChange } = initialiseTabTitle({ document: doc, isEnabled: enabled });

    onTagsChange({ urn: "URN123" });
    expect(doc.title).toBe("URN123");

    // Host app sets title late
    doc.title = "Late Title";

    // Next tag change reads the fresh title
    onTagsChange({ urn: "URN456" });
    expect(doc.title).toBe("URN456 \u2013 Late Title");
  });
});
