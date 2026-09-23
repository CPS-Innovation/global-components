import { effectiveSources, parsePolicy, splitPolicies } from "./parse-csp";

describe("parsePolicy", () => {
  it("splits directives and their sources", () => {
    expect(
      parsePolicy("connect-src 'self' https://a.example; script-src 'none'"),
    ).toEqual({
      "connect-src": ["'self'", "https://a.example"],
      "script-src": ["'none'"],
    });
  });

  it("tolerates a trailing semicolon and extra whitespace", () => {
    expect(parsePolicy("  connect-src   'self'  ;  ")).toEqual({
      "connect-src": ["'self'"],
    });
  });

  it("lowercases directive names", () => {
    expect(parsePolicy("Connect-Src 'self'")).toEqual({
      "connect-src": ["'self'"],
    });
  });

  it("records a valueless directive as an empty source list", () => {
    // Distinct from absent: `connect-src;` forbids everything, whereas no
    // connect-src at all falls back to default-src.
    expect(parsePolicy("connect-src; script-src 'self'")["connect-src"]).toEqual(
      [],
    );
  });
});

describe("effectiveSources", () => {
  it("returns the directive's own sources when present", () => {
    const policy = parsePolicy("connect-src https://a.example; default-src 'self'");

    expect(effectiveSources(policy, "connect-src")).toEqual({
      sources: ["https://a.example"],
      via: "connect-src",
    });
  });

  it("falls back to default-src for connect-src", () => {
    // The failure a naive checker invents: our host apps set default-src, so
    // treating a missing connect-src as empty reports a break that isn't one.
    const policy = parsePolicy("default-src 'self' https://a.example");

    expect(effectiveSources(policy, "connect-src")).toEqual({
      sources: ["'self'", "https://a.example"],
      via: "default-src",
    });
  });

  it("falls back frame-src -> child-src before default-src", () => {
    const policy = parsePolicy(
      "child-src https://frames.example; default-src 'self'",
    );

    expect(effectiveSources(policy, "frame-src")).toEqual({
      sources: ["https://frames.example"],
      via: "child-src",
    });
  });

  it("prefers frame-src over child-src when both are set", () => {
    const policy = parsePolicy(
      "frame-src https://a.example; child-src https://b.example",
    );

    expect(effectiveSources(policy, "frame-src").sources).toEqual([
      "https://a.example",
    ]);
  });

  it("does NOT fall back to default-src for form-action", () => {
    // form-action has no default-src fallback in CSP3. Inventing one would
    // fail every host app that sets default-src and no form-action.
    const policy = parsePolicy("default-src 'self'");

    expect(effectiveSources(policy, "form-action")).toEqual({
      sources: undefined,
    });
  });

  it("reports undefined when neither the directive nor any fallback is set", () => {
    expect(effectiveSources(parsePolicy("img-src 'self'"), "connect-src")).toEqual(
      { sources: undefined },
    );
  });
});

describe("splitPolicies", () => {
  it("splits comma-folded duplicate headers into separate policies", () => {
    // What an HTTP client hands back when a response carries two CSP headers.
    // Parsing this as one policy would splice `default-src` onto the end of
    // the previous directive's source list and corrupt both.
    expect(
      splitPolicies("connect-src 'self', default-src https://a.example"),
    ).toEqual(["connect-src 'self'", "default-src https://a.example"]);
  });

  it("returns a single policy unchanged", () => {
    expect(splitPolicies("connect-src 'self'")).toEqual(["connect-src 'self'"]);
  });

  it("ignores empty segments", () => {
    expect(splitPolicies("connect-src 'self',, ")).toEqual([
      "connect-src 'self'",
    ]);
  });
});
