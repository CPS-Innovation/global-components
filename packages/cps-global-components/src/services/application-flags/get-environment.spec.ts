import { getEnvironment } from "./get-environment";

describe("getEnvironment", () => {
  it("should extract 'test' from a test environment URL", () => {
    expect(getEnvironment("https://polaris-qa-notprod.cps.gov.uk/global-components/test/global-components.js")).toBe("test");
  });

  it("should extract 'dev' from a dev environment URL", () => {
    expect(getEnvironment("https://polaris-qa-notprod.cps.gov.uk/global-components/dev/global-components.js")).toBe("dev");
  });

  it("should extract 'prod' from a prod environment URL", () => {
    expect(getEnvironment("https://polaris-qa-notprod.cps.gov.uk/global-components/prod/global-components.js")).toBe("prod");
  });

  it("should extract arbitrary environment names", () => {
    expect(getEnvironment("https://polaris-qa-notprod.cps.gov.uk/global-components/staging/global-components.js")).toBe("staging");
    expect(getEnvironment("https://polaris-qa-notprod.cps.gov.uk/global-components/qa/global-components.js")).toBe("qa");
    expect(getEnvironment("https://polaris-qa-notprod.cps.gov.uk/global-components/uat/global-components.js")).toBe("uat");
  });

  it("should handle URLs with different domains", () => {
    expect(getEnvironment("https://example.com/global-components/test/global-components.js")).toBe("test");
    expect(getEnvironment("http://localhost:3000/global-components/dev/global-components.js")).toBe("dev");
  });

  it("should return unknown for URLs without the expected pattern", () => {
    expect(getEnvironment("https://example.com/some-other-path/test/script.js")).toBe("unknown");
    expect(getEnvironment("https://example.com/global-components.js")).toBe("unknown");
  });

  it("should return unknown for invalid URLs", () => {
    expect(getEnvironment("not a url")).toBe("unknown");
    expect(getEnvironment("")).toBe("unknown");
  });

  it("should return unknown when environment segment is missing", () => {
    expect(getEnvironment("https://example.com/global-components/")).toBe("unknown");
  });
});
