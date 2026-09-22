import { matchSource, matchSources, parseSource } from "./match-csp-source";

const GRAPH = "https://graph.microsoft.com";

describe("matchSource", () => {
  describe("the cases substring matching got wrong", () => {
    it("rejects a lookalike host that merely contains the required name", () => {
      // `actual.includes(required)` passed this.
      expect(matchSource(GRAPH, "https://graph.microsoft.com.evil.example")).toBe(
        "absent",
      );
    });

    it("rejects a parent domain, because CSP host matching is not suffix matching", () => {
      // `required.includes(actual)` passed this.
      expect(matchSource(GRAPH, "microsoft.com")).toBe("absent");
    });

    it("accepts a subdomain wildcard", () => {
      // Substring matching failed this in both directions.
      expect(matchSource(GRAPH, "*.microsoft.com")).toBe("allowed");
    });

    it("accepts the allow-all wildcard", () => {
      expect(matchSource(GRAPH, "*")).toBe("allowed");
    });
  });

  describe("host matching", () => {
    it("accepts an exact origin", () => {
      expect(matchSource(GRAPH, GRAPH)).toBe("allowed");
    });

    it("accepts a bare host with no scheme", () => {
      expect(matchSource(GRAPH, "graph.microsoft.com")).toBe("allowed");
    });

    it("is case insensitive on the host", () => {
      expect(matchSource(GRAPH, "GRAPH.Microsoft.COM")).toBe("allowed");
    });

    it("rejects a subdomain wildcard against the bare domain it wraps", () => {
      // *.example.com does not match example.com, per CSP3.
      expect(
        matchSource("https://microsoft.com", "*.microsoft.com"),
      ).toBe("absent");
    });

    it("rejects a scheme mismatch", () => {
      expect(matchSource(GRAPH, "http://graph.microsoft.com")).toBe("absent");
    });
  });

  describe("scheme-only sources", () => {
    it("accepts https: for an https origin", () => {
      expect(matchSource(GRAPH, "https:")).toBe("allowed");
    });

    it("rejects http: for an https origin", () => {
      expect(matchSource(GRAPH, "http:")).toBe("absent");
    });
  });

  describe("ports", () => {
    it("accepts an explicit default port", () => {
      expect(matchSource(GRAPH, "https://graph.microsoft.com:443")).toBe(
        "allowed",
      );
    });

    it("rejects a different port", () => {
      expect(matchSource(GRAPH, "https://graph.microsoft.com:8443")).toBe(
        "absent",
      );
    });

    it("accepts a port wildcard", () => {
      expect(matchSource(GRAPH, "https://graph.microsoft.com:*")).toBe(
        "allowed",
      );
    });
  });

  describe("paths", () => {
    it("reports a path-scoped source as narrower, not as a pass or a failure", () => {
      // The live case: a policy pinning ai.config.1.cfg.json permits today's
      // fetch and breaks when Microsoft bumps the version.
      expect(
        matchSource(
          "https://js.monitor.azure.com",
          "https://js.monitor.azure.com/scripts/b/ai.config.1.cfg.json",
        ),
      ).toBe("narrower");
    });

    it("treats a bare trailing slash as no restriction", () => {
      expect(matchSource(GRAPH, "https://graph.microsoft.com/")).toBe(
        "allowed",
      );
    });
  });

  describe("keywords", () => {
    it("resolves 'self' against the page origin when known", () => {
      expect(
        matchSource("https://a.example", "'self'", "https://a.example/page"),
      ).toBe("allowed");
      expect(
        matchSource("https://b.example", "'self'", "https://a.example/page"),
      ).toBe("absent");
    });

    it("does not treat 'unsafe-inline' as allowing a host", () => {
      expect(matchSource(GRAPH, "'unsafe-inline'")).toBe("absent");
    });

    it("does not treat 'none' as allowing a host", () => {
      expect(matchSource(GRAPH, "'none'")).toBe("absent");
    });
  });
});

describe("matchSources", () => {
  it("takes the best verdict across the list", () => {
    expect(
      matchSources(GRAPH, ["'self'", "https://other.example", GRAPH]),
    ).toBe("allowed");
  });

  it("prefers narrower over absent", () => {
    expect(
      matchSources("https://js.monitor.azure.com", [
        "'self'",
        "https://js.monitor.azure.com/scripts/b/ai.config.1.cfg.json",
      ]),
    ).toBe("narrower");
  });

  it("treats an unrestricted directive as allowed", () => {
    // undefined means no directive and no fallback applied — the browser places
    // no limit here, so it is not a finding against us.
    expect(matchSources(GRAPH, undefined)).toBe("allowed");
  });

  it("reports absent when nothing matches", () => {
    expect(matchSources(GRAPH, ["'self'", "https://other.example"])).toBe(
      "absent",
    );
  });
});

describe("parseSource", () => {
  it("separates host, port and path", () => {
    expect(parseSource("https://a.example:8443/some/path")).toEqual({
      kind: "host",
      scheme: "https:",
      host: "a.example",
      wildcardSubdomain: false,
      port: "8443",
      path: "/some/path",
    });
  });

  it("marks a subdomain wildcard and strips it from the host", () => {
    expect(parseSource("*.a.example")).toMatchObject({
      host: "a.example",
      wildcardSubdomain: true,
    });
  });
});

describe("keyword requirements", () => {
  // The handover page's profile is a complete policy, so some of its
  // requirements are keywords rather than origins. Passing one of those to
  // `new URL()` threw ERR_INVALID_URL on the first live run — the unit tests
  // had only ever required hosts.
  it("is satisfied by the identical keyword", () => {
    expect(matchSource("'self'", "'self'")).toBe("allowed");
    expect(matchSource("'unsafe-inline'", "'unsafe-inline'")).toBe("allowed");
  });

  it("is not satisfied by a different keyword", () => {
    expect(matchSource("'unsafe-inline'", "'self'")).toBe("absent");
  });

  it("is not satisfied by the allow-all wildcard", () => {
    // `*` permits any URL but grants no keyword capability.
    expect(matchSource("'unsafe-inline'", "*")).toBe("absent");
  });

  it("is not satisfied by a host source", () => {
    expect(matchSource("'self'", "https://a.example")).toBe("absent");
  });

  it("does not throw when the requirement is a keyword", () => {
    expect(() =>
      matchSources("'self'", ["'self'", "https://a.example", "*"]),
    ).not.toThrow();
  });
});
