import { describe, test, expect } from "@jest/globals";
import { transformConfig } from "./transform-config";
import { ConfigStorage } from "./Config";

describe("transformConfig", () => {
  test("preserves order of paths in flat structure", () => {
    const input: ConfigStorage = {
      ENVIRONMENT: "test",
      LINKS: [],
      BANNER_TITLE_HREF: "https://example.com",
      CONTEXTS: [
        {
          contexts: [
            { path: "/first", contextIds: "ctx1" },
            { path: "/second", contextIds: "ctx2" },
            { path: "/third", contextIds: "ctx3" },
          ],
        },
      ],
    };

    const result = transformConfig(input);

    expect(result.CONTEXTS.length).toBe(3);
    expect(result.CONTEXTS[0].path).toBe("/first");
    expect(result.CONTEXTS[1].path).toBe("/second");
    expect(result.CONTEXTS[2].path).toBe("/third");
  });

  test("preserves order of paths in nested structure", () => {
    const input: ConfigStorage = {
      ENVIRONMENT: "test",
      LINKS: [],
      BANNER_TITLE_HREF: "https://example.com",
      CONTEXTS: [
        {
          contexts: [
            { path: "/first", contextIds: "ctx1" },
            {
              contexts: [
                { path: "/second", contextIds: "ctx2" },
                { path: "/third", contextIds: "ctx3" },
              ],
            },
            { path: "/fourth", contextIds: "ctx4" },
          ],
        },
      ],
    };

    const result = transformConfig(input);

    expect(result.CONTEXTS.length).toBe(4);
    expect(result.CONTEXTS[0].path).toBe("/first");
    expect(result.CONTEXTS[1].path).toBe("/second");
    expect(result.CONTEXTS[2].path).toBe("/third");
    expect(result.CONTEXTS[3].path).toBe("/fourth");
  });

  test("preserves order with deeply nested structure", () => {
    const input: ConfigStorage = {
      ENVIRONMENT: "test",
      LINKS: [],
      BANNER_TITLE_HREF: "https://example.com",
      CONTEXTS: [
        {
          contexts: [
            { path: "/alpha", contextIds: "ctx-alpha" },
            {
              contexts: [
                { path: "/beta", contextIds: "ctx-beta" },
                {
                  contexts: [
                    { path: "/gamma", contextIds: "ctx-gamma" },
                    { path: "/delta", contextIds: "ctx-delta" },
                  ],
                },
                { path: "/epsilon", contextIds: "ctx-epsilon" },
              ],
            },
            { path: "/zeta", contextIds: "ctx-zeta" },
          ],
        },
      ],
    };

    const result = transformConfig(input);

    expect(result.CONTEXTS.length).toBe(6);
    expect(result.CONTEXTS[0].path).toBe("/alpha");
    expect(result.CONTEXTS[1].path).toBe("/beta");
    expect(result.CONTEXTS[2].path).toBe("/gamma");
    expect(result.CONTEXTS[3].path).toBe("/delta");
    expect(result.CONTEXTS[4].path).toBe("/epsilon");
    expect(result.CONTEXTS[5].path).toBe("/zeta");
  });

  test("inherits properties from parent nodes", () => {
    const input: ConfigStorage = {
      ENVIRONMENT: "test",
      LINKS: [],
      BANNER_TITLE_HREF: "https://example.com",
      CONTEXTS: [
        {
          msalRedirectUrl: "https://redirect.example.com",
          applyShim: "work-management",
          contexts: [
            { path: "/first", contextIds: "ctx1" },
            {
              forceCmsAuthRefresh: true,
              contexts: [{ path: "/second", contextIds: "ctx2" }],
            },
          ],
        },
      ],
    };

    const result = transformConfig(input);

    expect(result.CONTEXTS.length).toBe(2);

    // First context inherits from root
    expect(result.CONTEXTS[0].path).toBe("/first");
    expect(result.CONTEXTS[0].msalRedirectUrl).toBe(
      "https://redirect.example.com"
    );
    expect(result.CONTEXTS[0].applyShim).toBe("work-management");
    expect(result.CONTEXTS[0].forceCmsAuthRefresh).toBeUndefined();

    // Second context inherits from both root and intermediate node
    expect(result.CONTEXTS[1].path).toBe("/second");
    expect(result.CONTEXTS[1].msalRedirectUrl).toBe(
      "https://redirect.example.com"
    );
    expect(result.CONTEXTS[1].applyShim).toBe("work-management");
    expect(result.CONTEXTS[1].forceCmsAuthRefresh).toBe(true);
  });

  test("overrides properties at deeper levels", () => {
    const input: ConfigStorage = {
      ENVIRONMENT: "test",
      LINKS: [],
      BANNER_TITLE_HREF: "https://example.com",
      CONTEXTS: [
        {
          msalRedirectUrl: "https://root.example.com",
          applyShim: "housekeeping",
          contexts: [
            {
              msalRedirectUrl: "https://child.example.com",
              contexts: [{ path: "/first", contextIds: "ctx1" }],
            },
          ],
        },
      ],
    };

    const result = transformConfig(input);

    expect(result.CONTEXTS.length).toBe(1);
    expect(result.CONTEXTS[0].path).toBe("/first");
    expect(result.CONTEXTS[0].msalRedirectUrl).toBe(
      "https://child.example.com"
    );
    expect(result.CONTEXTS[0].applyShim).toBe("housekeeping");
  });

  test("preserves order with multiple root-level context nodes", () => {
    const input: ConfigStorage = {
      ENVIRONMENT: "test",
      LINKS: [],
      BANNER_TITLE_HREF: "https://example.com",
      CONTEXTS: [
        {
          msalRedirectUrl: "https://group1.example.com",
          contexts: [
            { path: "/first", contextIds: "ctx1" },
            { path: "/second", contextIds: "ctx2" },
          ],
        },
        {
          msalRedirectUrl: "https://group2.example.com",
          contexts: [
            { path: "/third", contextIds: "ctx3" },
            { path: "/fourth", contextIds: "ctx4" },
          ],
        },
      ],
    };

    const result = transformConfig(input);

    expect(result.CONTEXTS.length).toBe(4);
    expect(result.CONTEXTS[0].path).toBe("/first");
    expect(result.CONTEXTS[0].msalRedirectUrl).toBe(
      "https://group1.example.com"
    );
    expect(result.CONTEXTS[1].path).toBe("/second");
    expect(result.CONTEXTS[1].msalRedirectUrl).toBe(
      "https://group1.example.com"
    );
    expect(result.CONTEXTS[2].path).toBe("/third");
    expect(result.CONTEXTS[2].msalRedirectUrl).toBe(
      "https://group2.example.com"
    );
    expect(result.CONTEXTS[3].path).toBe("/fourth");
    expect(result.CONTEXTS[3].msalRedirectUrl).toBe(
      "https://group2.example.com"
    );
  });

  test("handles empty contexts array", () => {
    const input: ConfigStorage = {
      ENVIRONMENT: "test",
      LINKS: [],
      BANNER_TITLE_HREF: "https://example.com",
      CONTEXTS: [
        {
          contexts: [],
        },
      ],
    };

    const result = transformConfig(input);

    expect(result.CONTEXTS.length).toBe(0);
  });

  test("preserves non-CONTEXTS properties", () => {
    const input: ConfigStorage = {
      ENVIRONMENT: "production",
      LINKS: [
        {
          label: "Home",
          href: "/home",
          activeContexts: "*",
          visibleContexts: "*",
          level: 1,
        },
      ],
      BANNER_TITLE_HREF: "https://example.com",
      AD_TENANT_AUTHORITY: "https://login.microsoftonline.com/tenant-id",
      AD_CLIENT_ID: "client-123",
      SHOW_MENU: true,
      CONTEXTS: [
        {
          contexts: [{ path: "/test", contextIds: "ctx1" }],
        },
      ],
    };

    const result = transformConfig(input);

    expect(result.ENVIRONMENT).toBe("production");
    expect(result.LINKS.length).toBe(1);
    expect(result.LINKS[0].label).toBe("Home");
    expect(result.BANNER_TITLE_HREF).toBe("https://example.com");
    expect(result.AD_TENANT_AUTHORITY).toBe(
      "https://login.microsoftonline.com/tenant-id"
    );
    expect(result.AD_CLIENT_ID).toBe("client-123");
    expect(result.SHOW_MENU).toBe(true);
  });

  test("preserves order with complex mixed nesting", () => {
    const input: ConfigStorage = {
      ENVIRONMENT: "test",
      LINKS: [],
      BANNER_TITLE_HREF: "https://example.com",
      CONTEXTS: [
        {
          contexts: [
            { path: "/path-1", contextIds: "1" },
            {
              contexts: [
                { path: "/path-2", contextIds: "2" },
                { path: "/path-3", contextIds: "3" },
              ],
            },
            { path: "/path-4", contextIds: "4" },
            {
              contexts: [
                {
                  contexts: [{ path: "/path-5", contextIds: "5" }],
                },
                { path: "/path-6", contextIds: "6" },
              ],
            },
            { path: "/path-7", contextIds: "7" },
          ],
        },
      ],
    };

    const result = transformConfig(input);

    expect(result.CONTEXTS.length).toBe(7);
    for (let i = 0; i < 7; i++) {
      expect(result.CONTEXTS[i].path).toBe(`/path-${i + 1}`);
      expect(result.CONTEXTS[i].contextIds).toBe(`${i + 1}`);
    }
  });
});
