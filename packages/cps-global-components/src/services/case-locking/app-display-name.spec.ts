import { appDisplayName } from "./app-display-name";

describe("appDisplayName", () => {
  it("maps the backend's vocabulary to what users call the product", () => {
    expect(appDisplayName("Work Management App")).toBe("RCMS");
    expect(appDisplayName("Case Review App")).toBe("RCMS");
    expect(appDisplayName("Casework App")).toBe("RCMS");
  });

  // The API's vocabulary is wider than the table — CMS Classic and CMS Modern are
  // already the names users know, so they are deliberately absent from it.
  it("shows an unmapped application as the API sent it", () => {
    expect(appDisplayName("CMS Classic")).toBe("CMS Classic");
    expect(appDisplayName("CMS Modern")).toBe("CMS Modern");
    expect(appDisplayName("Something New")).toBe("Something New");
  });

  // The caller omits the clause entirely rather than printing an empty gap.
  it("is undefined when the API sends no application", () => {
    expect(appDisplayName(undefined)).toBeUndefined();
    expect(appDisplayName("")).toBeUndefined();
  });
});
