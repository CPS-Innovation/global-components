import { extractTagsFromCaseDetails } from "./extract-tags-from-case-details";
import { CaseDetails } from "./CaseDetails";

describe("extractTagsFromCaseDetails", () => {
  describe("when all tag fields are present", () => {
    it("should return allTagsArePresent as true", () => {
      const caseDetails: Partial<CaseDetails> = {
        urn: "12AB3456789",
        isDcfCase: true,
      };

      const result = extractTagsFromCaseDetails(caseDetails);

      expect(result.allTagsArePresent).toBe(true);
    });

    it("should extract urn and isDcfCase as tags", () => {
      const caseDetails: Partial<CaseDetails> = {
        urn: "12AB3456789",
        isDcfCase: false,
      };

      const result = extractTagsFromCaseDetails(caseDetails);

      expect(result.tags).toEqual({
        urn: "12AB3456789",
        isDcfCase: false,
      });
    });

    it("should include all tag fields even when extra fields are present", () => {
      const caseDetails: CaseDetails = {
        urn: "12AB3456789",
        isDcfCase: true,
      };

      const result = extractTagsFromCaseDetails(caseDetails);

      expect(result.allTagsArePresent).toBe(true);
      expect(result.tags).toEqual({
        urn: "12AB3456789",
        isDcfCase: true,
      });
    });

    it("should not include caseId in tags", () => {
      const caseDetails: CaseDetails = {
        urn: "99ZZ1234567",
        isDcfCase: false,
      };

      const result = extractTagsFromCaseDetails(caseDetails);

      expect(result.tags).not.toHaveProperty("caseId");
    });
  });

  describe("when some tag fields are missing", () => {
    it("should return allTagsArePresent as false when urn is missing", () => {
      const caseDetails: Partial<CaseDetails> = {
        isDcfCase: true,
      };

      const result = extractTagsFromCaseDetails(caseDetails);

      expect(result.allTagsArePresent).toBe(false);
    });

    it("should return allTagsArePresent as false when isDcfCase is missing", () => {
      const caseDetails: Partial<CaseDetails> = {
        urn: "12AB3456789",
      };

      const result = extractTagsFromCaseDetails(caseDetails);

      expect(result.allTagsArePresent).toBe(false);
    });

    it("should still extract available tag fields when some are missing", () => {
      const caseDetails: Partial<CaseDetails> = {
        urn: "12AB3456789",
      };

      const result = extractTagsFromCaseDetails(caseDetails);

      expect(result.tags).toEqual({
        urn: "12AB3456789",
        isDcfCase: undefined,
      });
    });
  });

  describe("when no tag fields are present", () => {
    it("should return allTagsArePresent as false for empty object", () => {
      const caseDetails: Partial<CaseDetails> = {};

      const result = extractTagsFromCaseDetails(caseDetails);

      expect(result.allTagsArePresent).toBe(false);
    });

    it("should return tags with undefined values for empty object", () => {
      const caseDetails: Partial<CaseDetails> = {};

      const result = extractTagsFromCaseDetails(caseDetails);

      expect(result.tags).toEqual({
        urn: undefined,
        isDcfCase: undefined,
      });
    });
  });

  describe("edge cases", () => {
    it("should handle empty string urn", () => {
      const caseDetails: Partial<CaseDetails> = {
        urn: "",
        isDcfCase: false,
      };

      const result = extractTagsFromCaseDetails(caseDetails);

      expect(result.allTagsArePresent).toBe(true);
      expect(result.tags).toEqual({
        urn: "",
        isDcfCase: false,
      });
    });

    it("should handle isDcfCase as false", () => {
      const caseDetails: Partial<CaseDetails> = {
        urn: "12AB3456789",
        isDcfCase: false,
      };

      const result = extractTagsFromCaseDetails(caseDetails);

      expect(result.allTagsArePresent).toBe(true);
      expect(result.tags.isDcfCase).toBe(false);
    });
  });
});
