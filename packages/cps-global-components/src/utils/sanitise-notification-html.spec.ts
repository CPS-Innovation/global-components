import { sanitiseNotificationHtml } from "./sanitise-notification-html";

describe("sanitiseNotificationHtml", () => {
  it("preserves allow-listed tags", () => {
    expect(sanitiseNotificationHtml("<p>hello <strong>world</strong></p>")).toBe("<p>hello <strong>world</strong></p>");
  });

  it("preserves <br> and <em>", () => {
    expect(sanitiseNotificationHtml("<p>a<br><em>b</em></p>")).toBe("<p>a<br><em>b</em></p>");
  });

  it("strips <script> tags", () => {
    const out = sanitiseNotificationHtml("<p>ok</p><script>alert(1)</script>");
    expect(out).not.toContain("<script");
    expect(out).toContain("<p>ok</p>");
  });

  it("strips <img> and on* attributes", () => {
    const out = sanitiseNotificationHtml('<p onclick="bad()">x</p><img src="x" onerror="bad()">');
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("<img");
    expect(out).toContain("<p>x</p>");
  });

  it("strips <iframe>", () => {
    const out = sanitiseNotificationHtml("<p>pre</p><iframe src=\"bad\"></iframe><p>post</p>");
    expect(out).not.toContain("<iframe");
    expect(out).toContain("<p>pre</p>");
    expect(out).toContain("<p>post</p>");
  });

  it("keeps safe hrefs", () => {
    const out = sanitiseNotificationHtml('<a href="https://example.com">x</a>');
    expect(out).toContain('href="https://example.com"');
  });

  it("drops javascript: hrefs", () => {
    const out = sanitiseNotificationHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript");
    expect(out).toContain("<a>x</a>");
  });

  it("keeps mailto: hrefs", () => {
    const out = sanitiseNotificationHtml('<a href="mailto:user@example.com">mail</a>');
    expect(out).toContain('href="mailto:user@example.com"');
  });

  it("adds safe rel when target=_blank is present", () => {
    const out = sanitiseNotificationHtml('<a href="https://example.com" target="_blank">x</a>');
    expect(out).toContain('rel="noreferrer noopener"');
  });

  it("drops non-_blank targets", () => {
    const out = sanitiseNotificationHtml('<a href="https://example.com" target="_parent">x</a>');
    expect(out).not.toContain("target");
  });

  it("unwraps disallowed tags but keeps inner text", () => {
    const out = sanitiseNotificationHtml("<div><p>inside</p></div>");
    expect(out).toContain("<p>inside</p>");
    expect(out).not.toContain("<div");
  });

  it("escapes bare text angle brackets without emitting markup", () => {
    const out = sanitiseNotificationHtml("5 < 6");
    expect(out).not.toContain("<");
  });
});
