import { getArtifactUrl } from "./get-artifact-url";

describe("getArtifactUrl", () => {
  const rootUrl = "https://example.com/env/components/script.js";

  describe("same folder paths", () => {
    it("should resolve file in same folder", () => {
      const result = getArtifactUrl(rootUrl, "config.json");

      expect(result).toBe("https://example.com/env/components/config.json");
    });

    it("should handle filenames with multiple dots", () => {
      const result = getArtifactUrl(rootUrl, "my-file.test.js");

      expect(result).toBe("https://example.com/env/components/my-file.test.js");
    });
  });

  describe("sibling folder paths", () => {
    it("should resolve file in sibling folder", () => {
      const result = getArtifactUrl(rootUrl, "../preview/index.html");

      expect(result).toBe("https://example.com/env/preview/index.html");
    });

    it("should handle different sibling folder names", () => {
      const result = getArtifactUrl(rootUrl, "../other-folder/script.js");

      expect(result).toBe("https://example.com/env/other-folder/script.js");
    });
  });

  describe("deeply nested paths", () => {
    it("should resolve multiple parent traversals", () => {
      const result = getArtifactUrl(rootUrl, "../../parent/file.txt");

      expect(result).toBe("https://example.com/parent/file.txt");
    });

    it("should work with deeply nested root URLs", () => {
      const deepRoot = "https://example.com/a/b/c/d/script.js";
      const result = getArtifactUrl(deepRoot, "../sibling/file.txt");

      expect(result).toBe("https://example.com/a/b/c/sibling/file.txt");
    });
  });

  describe("different root URLs", () => {
    it("should work with different domains", () => {
      const result = getArtifactUrl("https://cdn.example.com/assets/main.js", "styles.css");

      expect(result).toBe("https://cdn.example.com/assets/styles.css");
    });

    it("should work with root URL ending in slash", () => {
      const result = getArtifactUrl("https://example.com/folder/", "file.txt");

      expect(result).toBe("https://example.com/folder/file.txt");
    });
  });
});
