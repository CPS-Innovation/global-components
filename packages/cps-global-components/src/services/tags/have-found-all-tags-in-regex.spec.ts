import { haveFoundAllTagsInRegex } from "./have-found-all-tags-in-regex";
import { Tags } from "./Tags";

describe("haveFoundAllTagsInRegex", () => {
  it("should return true when all named groups exist in tags", () => {
    const regex = "https://example.com/users/(?<userId>\\d+)";
    const tags: Tags = { userId: "123" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should return false when not all named groups exist in tags", () => {
    const regex = "https://example.com/users/(?<userId>\\d+)/posts/(?<postId>\\d+)";
    const tags: Tags = { userId: "123" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(false);
  });

  it("should return true when multiple named groups all exist in tags", () => {
    const regex = "https://example.com/users/(?<userId>\\d+)/posts/(?<postId>\\d+)";
    const tags: Tags = { userId: "123", postId: "456" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should return true when regex has no named groups", () => {
    const regex = "https://example.com/users/\\d+";
    const tags: Tags = { userId: "123" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should return true when regex has no named groups and tags is empty", () => {
    const regex = "https://example.com/users/\\d+";
    const tags: Tags = {};
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should return true when tags contains extra keys not in regex", () => {
    const regex = "https://example.com/users/(?<userId>\\d+)";
    const tags: Tags = { userId: "123", extraTag: "value" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should handle regex with alternative named group syntax using single quotes", () => {
    const regex = "https://example.com/users/(?'userId'\\d+)";
    const tags: Tags = { userId: "123" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should handle regex with mixed named group syntax", () => {
    const regex = "https://example.com/users/(?<userId>\\d+)/posts/(?'postId'\\d+)";
    const tags: Tags = { userId: "123", postId: "456" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should return false when using single quote syntax and tag is missing", () => {
    const regex = "https://example.com/users/(?'userId'\\d+)";
    const tags: Tags = { postId: "456" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(false);
  });

  it("should handle regex with non-capturing groups", () => {
    const regex = "https://example.com/(?:api)/users/(?<userId>\\d+)";
    const tags: Tags = { userId: "123" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should handle complex regex with multiple group types", () => {
    const regex = "https://example.com/(?:api)/v(?<version>\\d+)/users/(?<userId>\\d+)/(?:posts)";
    const tags: Tags = { version: "1", userId: "123" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should handle regex with named groups containing underscores", () => {
    const regex = "https://example.com/users/(?<user_id>\\d+)";
    const tags: Tags = { user_id: "123" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should handle regex with named groups containing numbers", () => {
    const regex = "https://example.com/items/(?<item1>\\d+)/(?<item2>\\d+)";
    const tags: Tags = { item1: "123", item2: "456" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should return false when one of many named groups is missing", () => {
    const regex = "https://example.com/users/(?<userId>\\d+)/posts/(?<postId>\\d+)/comments/(?<commentId>\\d+)";
    const tags: Tags = { userId: "123", commentId: "789" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(false);
  });

  it("should handle empty regex string", () => {
    const regex = "";
    const tags: Tags = { userId: "123" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should handle regex with lookahead assertions", () => {
    const regex = "https://example.com/search(?=.*[&?]userId=(?<userId>\\d+))";
    const tags: Tags = { userId: "123" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should handle regex with multiple lookahead assertions", () => {
    const regex = "https://example.com/search(?=.*[&?]userId=(?<userId>\\d+))(?=.*[&?]postId=(?<postId>\\d+))";
    const tags: Tags = { userId: "123", postId: "456" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should return false when lookahead named groups are missing from tags", () => {
    const regex = "https://example.com/search(?=.*[&?]userId=(?<userId>\\d+))(?=.*[&?]postId=(?<postId>\\d+))";
    const tags: Tags = { userId: "123" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(false);
  });

  it("should handle duplicate named groups in regex", () => {
    const regex = "https://example.com/(?<id>\\d+)/items/(?<id>\\d+)";
    const tags: Tags = { id: "123" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should handle real-world OutSystems-style regex pattern", () => {
    const regex = "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview.*?[&?]CaseId=(?<caseId>\\d+)&URN=(?<urn>[^&]+)";
    const tags: Tags = { caseId: "12345", urn: "ABC123" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(true);
  });

  it("should return false for real-world pattern when URN tag is missing", () => {
    const regex = "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview.*?[&?]CaseId=(?<caseId>\\d+)&URN=(?<urn>[^&]+)";
    const tags: Tags = { caseId: "12345" };
    const result = haveFoundAllTagsInRegex(regex, tags);
    expect(result).toBe(false);
  });
});
