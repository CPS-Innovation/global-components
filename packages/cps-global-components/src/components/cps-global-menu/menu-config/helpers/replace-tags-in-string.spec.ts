import { replaceTagsInString } from "./replace-tags-in-string";

describe("replaceTagsInString", () => {
  it("should return original string when no tags provided", () => {
    const result = replaceTagsInString("Hello {name}", {});
    expect(result).toBe("Hello {name}");
  });

  it("should replace single tag", () => {
    const result = replaceTagsInString("Hello {name}", { name: "World" });
    expect(result).toBe("Hello World");
  });

  it("should replace multiple different tags", () => {
    const result = replaceTagsInString(
      "Hello {firstName} {lastName}, welcome to {city}",
      { firstName: "John", lastName: "Doe", city: "London" }
    );
    expect(result).toBe("Hello John Doe, welcome to London");
  });

  it("should replace repeated tags", () => {
    const result = replaceTagsInString(
      "{name} is {name} and {name} will always be {name}",
      { name: "John" }
    );
    expect(result).toBe("John is John and John will always be John");
  });

  it("should handle tags with no spaces around them", () => {
    const result = replaceTagsInString(
      "{prefix}{middle}{suffix}",
      { prefix: "start", middle: "-middle-", suffix: "end" }
    );
    expect(result).toBe("start-middle-end");
  });

  it("should be case sensitive for tag names", () => {
    const result = replaceTagsInString(
      "{name} and {Name} and {NAME}",
      { name: "lower", Name: "capital", NAME: "upper" }
    );
    expect(result).toBe("lower and capital and upper");
  });

  it("should handle empty string input", () => {
    const result = replaceTagsInString("", { tag: "value" });
    expect(result).toBe("");
  });

  it("should handle empty tag values", () => {
    const result = replaceTagsInString(
      "Start{tag}End",
      { tag: "" }
    );
    expect(result).toBe("StartEnd");
  });

  it("should only replace exact tag matches", () => {
    const result = replaceTagsInString(
      "{tag} and {tagName} and {tags}",
      { tag: "replaced" }
    );
    expect(result).toBe("replaced and {tagName} and {tags}");
  });

  it("should handle special characters in tag values", () => {
    const result = replaceTagsInString(
      "URL: {url}",
      { url: "https://example.com?param=value&other=123" }
    );
    expect(result).toBe("URL: https://example.com?param=value&other=123");
  });

  it("should handle numeric tag values", () => {
    const result = replaceTagsInString(
      "Count: {count}, Price: ${price}",
      { count: "42", price: "99.99" }
    );
    expect(result).toBe("Count: 42, Price: $99.99");
  });

  it("should handle tags in URLs", () => {
    const result = replaceTagsInString(
      "/api/{version}/users/{userId}/posts/{postId}",
      { version: "v2", userId: "123", postId: "456" }
    );
    expect(result).toBe("/api/v2/users/123/posts/456");
  });

  it("should not replace tags within other tags", () => {
    const result = replaceTagsInString(
      "{outer{inner}outer}",
      { inner: "INNER", outer: "OUTER" }
    );
    expect(result).toBe("{outerINNERouter}");
  });

  it("should handle malformed tags", () => {
    const result = replaceTagsInString(
      "Valid {tag} and invalid }tag{ and {tag",
      { tag: "value" }
    );
    expect(result).toBe("Valid value and invalid }tag{ and {tag");
  });

  it("should handle tags with underscores and hyphens", () => {
    const result = replaceTagsInString(
      "{user_id} and {post-id} and {mixed_tag-name}",
      { 
        user_id: "123",
        "post-id": "456",
        "mixed_tag-name": "789"
      }
    );
    expect(result).toBe("123 and 456 and 789");
  });

  it("should process tags in order they appear in tags object", () => {
    const result = replaceTagsInString(
      "{a}{b}{c}",
      { c: "3", a: "1", b: "2" }
    );
    expect(result).toBe("123");
  });

  it("should handle nested braces that don't form valid tags", () => {
    const result = replaceTagsInString(
      "{{tag}} and {{{tag}}}",
      { tag: "value" }
    );
    expect(result).toBe("{value} and {{value}}");
  });

  it("should handle whitespace in tag values", () => {
    const result = replaceTagsInString(
      "Say: {greeting}",
      { greeting: "  Hello World  " }
    );
    expect(result).toBe("Say:   Hello World  ");
  });

  it("should handle very long tag values", () => {
    const longValue = "a".repeat(1000);
    const result = replaceTagsInString(
      "Start{tag}End",
      { tag: longValue }
    );
    expect(result).toBe(`Start${longValue}End`);
  });
});