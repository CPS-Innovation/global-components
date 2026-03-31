import { getEnvironment } from "./get-environment";

describe("getEnvironment", () => {
  describe("environment extraction", () => {
    it("should extract 'test' from a test environment URL", () => {
      expect(getEnvironment("https://polaris-qa-notprod.cps.gov.uk/global-components/test/global-components.js").environment).toBe("test");
    });

    it("should extract 'dev' from a dev environment URL", () => {
      expect(getEnvironment("https://polaris-qa-notprod.cps.gov.uk/global-components/dev/global-components.js").environment).toBe("dev");
    });

    it("should extract 'prod' from a prod environment URL", () => {
      expect(getEnvironment("https://polaris-qa-notprod.cps.gov.uk/global-components/prod/global-components.js").environment).toBe("prod");
    });

    it("should extract arbitrary environment names", () => {
      expect(getEnvironment("https://polaris-qa-notprod.cps.gov.uk/global-components/staging/global-components.js").environment).toBe("staging");
      expect(getEnvironment("https://polaris-qa-notprod.cps.gov.uk/global-components/qa/global-components.js").environment).toBe("qa");
      expect(getEnvironment("https://polaris-qa-notprod.cps.gov.uk/global-components/uat/global-components.js").environment).toBe("uat");
    });

    it("should handle URLs with different domains", () => {
      expect(getEnvironment("https://example.com/global-components/test/global-components.js").environment).toBe("test");
      expect(getEnvironment("http://localhost:3000/global-components/dev/global-components.js").environment).toBe("dev");
    });

    it("should return unknown for URLs without the expected pattern", () => {
      expect(getEnvironment("https://example.com/some-other-path/test/script.js").environment).toBe("unknown");
      expect(getEnvironment("https://example.com/global-components.js").environment).toBe("unknown");
    });

    it("should return unknown for invalid URLs", () => {
      expect(getEnvironment("not a url").environment).toBe("unknown");
      expect(getEnvironment("").environment).toBe("unknown");
    });

    it("should return unknown when environment segment is missing", () => {
      expect(getEnvironment("https://example.com/global-components/").environment).toBe("unknown");
    });
  });

  describe("origin extraction", () => {
    it("should extract origin from a valid URL", () => {
      expect(getEnvironment("https://polaris-qa-notprod.cps.gov.uk/global-components/test/global-components.js").origin).toBe("https://polaris-qa-notprod.cps.gov.uk");
    });

    it("should extract origin from localhost URLs", () => {
      expect(getEnvironment("http://localhost:3000/global-components/dev/global-components.js").origin).toBe("http://localhost:3000");
    });

    it("should return empty string for invalid URLs", () => {
      expect(getEnvironment("not a url").origin).toBe("");
      expect(getEnvironment("").origin).toBe("");
    });
  });
});
