import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  deriveCspRequirements,
  deriveHandoverPagePolicy,
  formatCspPolicy,
  groupByDirective,
  mergeCspRequirements,
  type CspRelevantConfig,
} from "./derive-csp";
import type { CspDirective, CspRequirement } from "./csp-requirements";

const CONFIG_DIR = join(__dirname, "..", "..", "..", "..", "configuration");

const aConfig = (
  overrides: Partial<CspRelevantConfig> = {},
): CspRelevantConfig => ({
  OS_HANDOVER_URL:
    "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https://polaris-qa-notprod.cps.gov.uk/global-components/test/auth-handover.js",
  AD_TENANT_AUTHORITY: "https://login.microsoftonline.com/00dd0d1d-tenant",
  APP_INSIGHTS_CONNECTION_STRING:
    "InstrumentationKey=abc;IngestionEndpoint=https://polaris-qa-notprod.cps.gov.uk/global-components/analytics/;ApplicationId=def",
  CASE_LOCKING_API_URL:
    "https://polaris-qa-notprod.cps.gov.uk/global-components/case-locking/api/hubs/notifications",
  ...overrides,
});

const valuesFor = (
  requirements: CspRequirement[],
  directive: CspDirective,
): string[] => groupByDirective(requirements)[directive] ?? [];

describe("deriveCspRequirements", () => {
  describe("hostApp", () => {
    it("takes the bundle origin from OS_HANDOVER_URL's ?src= parameter", () => {
      const { hostApp } = deriveCspRequirements(aConfig());

      expect(valuesFor(hostApp, "script-src")).toEqual([
        "https://polaris-qa-notprod.cps.gov.uk",
      ]);
    });

    it("takes the analytics origin from the connection string, not the Azure default", () => {
      const { hostApp } = deriveCspRequirements(
        aConfig({
          APP_INSIGHTS_CONNECTION_STRING:
            "InstrumentationKey=abc;IngestionEndpoint=https://uksouth-1.in.applicationinsights.azure.com/",
        }),
      );

      expect(valuesFor(hostApp, "connect-src")).toContain(
        "https://uksouth-1.in.applicationinsights.azure.com",
      );
    });

    it("requires graph.microsoft.com — the gap that prompted all of this", () => {
      const { hostApp } = deriveCspRequirements(aConfig());

      expect(valuesFor(hostApp, "connect-src")).toContain(
        "https://graph.microsoft.com",
      );
    });

    it("requires frame-src for the authority, for MSAL's silent iframe", () => {
      const { hostApp } = deriveCspRequirements(aConfig());

      expect(valuesFor(hostApp, "frame-src")).toEqual([
        "https://login.microsoftonline.com",
      ]);
    });

    it("omits the case-locking host when the feature is off for that environment", () => {
      const { hostApp } = deriveCspRequirements(
        aConfig({
          CASE_LOCKING_API_URL: undefined,
          APP_INSIGHTS_CONNECTION_STRING: undefined,
          OS_HANDOVER_URL: undefined,
        }),
      );

      expect(valuesFor(hostApp, "connect-src")).not.toContain(
        "https://polaris-qa-notprod.cps.gov.uk",
      );
    });

    it("does not ask the host app for keyword sources that are its own business", () => {
      const { hostApp } = deriveCspRequirements(aConfig());

      expect(hostApp.map(r => r.value)).not.toContain("'self'");
      expect(hostApp.map(r => r.value)).not.toContain("'unsafe-inline'");
    });
  });

  describe("handoverPage", () => {
    it("excludes analytics and case-locking hosts — that bundle has neither", () => {
      const { handoverPage } = deriveCspRequirements(
        aConfig({
          APP_INSIGHTS_CONNECTION_STRING:
            "InstrumentationKey=abc;IngestionEndpoint=https://ingestion.example.com/",
          CASE_LOCKING_API_URL: "https://hub.example.com/hubs/notifications",
        }),
      );
      const connect = valuesFor(handoverPage, "connect-src");

      expect(connect).not.toContain("https://ingestion.example.com");
      expect(connect).not.toContain("https://hub.example.com");
      expect(connect).not.toContain("https://js.monitor.azure.com");
    });

    it("requires form-action for MSAL's POST to AAD", () => {
      const { handoverPage } = deriveCspRequirements(aConfig());

      expect(valuesFor(handoverPage, "form-action")).toEqual([
        "https://login.microsoftonline.com",
      ]);
    });

    it("is a complete policy, so it does carry keyword sources", () => {
      const { handoverPage } = deriveCspRequirements(aConfig());

      expect(valuesFor(handoverPage, "connect-src")).toContain("'self'");
      expect(valuesFor(handoverPage, "script-src")).toContain(
        "'unsafe-inline'",
      );
    });
  });

  describe("malformed input", () => {
    it("drops unparseable urls rather than throwing", () => {
      const derive = () =>
        deriveCspRequirements(
          aConfig({
            OS_HANDOVER_URL: "not-a-url",
            AD_TENANT_AUTHORITY: "",
            APP_INSIGHTS_CONNECTION_STRING: "InstrumentationKey=abc;",
            CASE_LOCKING_API_URL: "://broken",
          }),
        );

      expect(derive).not.toThrow();
      expect(valuesFor(derive().hostApp, "script-src")).toEqual([]);
    });

    it("ignores an OS_HANDOVER_URL with no ?src= parameter", () => {
      const { hostApp } = deriveCspRequirements(
        aConfig({
          OS_HANDOVER_URL:
            "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html",
        }),
      );

      expect(valuesFor(hostApp, "script-src")).toEqual([]);
    });
  });
});

describe("mergeCspRequirements", () => {
  it("collapses duplicates and keeps both reasons", () => {
    const merged = mergeCspRequirements(
      [{ directive: "connect-src", value: "https://a.example", reason: "one" }],
      [{ directive: "connect-src", value: "https://a.example", reason: "two" }],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]!.reason).toContain("one");
    expect(merged[0]!.reason).toContain("two");
  });

  it("does not repeat an identical reason", () => {
    const merged = mergeCspRequirements(
      [{ directive: "connect-src", value: "https://a.example", reason: "one" }],
      [{ directive: "connect-src", value: "https://a.example", reason: "one" }],
    );

    expect(merged[0]!.reason).toBe("one");
  });

  it("keeps the same value under different directives apart", () => {
    const merged = mergeCspRequirements(
      [{ directive: "connect-src", value: "https://a.example", reason: "x" }],
      [{ directive: "script-src", value: "https://a.example", reason: "y" }],
    );

    expect(merged).toHaveLength(2);
  });
});

describe("formatCspPolicy", () => {
  it("is deterministic regardless of input order", () => {
    const a: CspRequirement = {
      directive: "connect-src",
      value: "https://a.example",
      reason: "a",
    };
    const b: CspRequirement = {
      directive: "script-src",
      value: "https://b.example",
      reason: "b",
    };

    expect(formatCspPolicy([a, b])).toBe(formatCspPolicy([b, a]));
  });

  it("renders directive then space-separated values, semicolon terminated", () => {
    expect(
      formatCspPolicy([
        { directive: "form-action", value: "https://a.example", reason: "a" },
      ]),
    ).toBe("form-action https://a.example;");
  });
});

// These read the real committed configs. They are the reason the module exists:
// if someone repoints an endpoint, the derived policy follows, and if they
// repoint it somewhere unparseable these fail rather than silently dropping a
// host from the published requirements.
describe("the committed environment configs", () => {
  // Named rather than globbed. config.accessibility.json also matches a glob
  // but is not an environment: it is the standalone blob-hosted demo site
  // (ENVIRONMENT "accessibility", empty OS_HANDOVER_URL, App Insights pointed
  // straight at Azure rather than through the Polaris proxy). Folding it in
  // would put the Azure ingestion host into the requirements we publish to the
  // OutSystems team, who have no use for it.
  const ENVIRONMENTS = ["dev", "test", "uat", "prod"];
  const configFiles = ENVIRONMENTS.map(env => `config.${env}.json`);

  it("has a config file on disk for every named environment", () => {
    const onDisk = readdirSync(CONFIG_DIR);

    expect(configFiles.filter(f => !onDisk.includes(f))).toEqual([]);
  });

  it("does not silently skip a newly added environment config", () => {
    // Fails when someone adds configuration/config.<something>.json without
    // deciding whether it belongs in ENVIRONMENTS above.
    const known = new Set([...configFiles, "config.accessibility.json"]);
    // OS host variants (config.<env>.<variant>.json) are deliberately absent:
    // outsystems-host-consistency.spec.ts pins each one to its environment's
    // config with only the OS host swapped, and nothing here depends on that host.
    const unaccountedFor = readdirSync(CONFIG_DIR).filter(
      f => /^config\.[^.]+\.json$/.test(f) && !known.has(f),
    );

    expect(unaccountedFor).toEqual([]);
  });

  const load = (file: string): CspRelevantConfig =>
    JSON.parse(readFileSync(join(CONFIG_DIR, file), "utf8"));

  it.each(configFiles)("%s derives a usable host-app policy", file => {
    const { hostApp } = deriveCspRequirements(load(file));

    expect(valuesFor(hostApp, "connect-src")).toContain(
      "https://graph.microsoft.com",
    );
    expect(valuesFor(hostApp, "frame-src")).toEqual([
      "https://login.microsoftonline.com",
    ]);
  });

  it("derives analytics onto the Polaris proxy, not Azure, for every environment", () => {
    // If this fails, an environment has been repointed at Azure directly and
    // the published requirements need the Azure host back.
    const azureIngestion = configFiles
      .map(load)
      .flatMap(c => deriveCspRequirements(c).hostApp)
      .filter(r => r.value.includes("applicationinsights.azure.com"));

    expect(azureIngestion).toEqual([]);
  });

  it("unions the handover policy across environments without duplicating", () => {
    const policy = deriveHandoverPagePolicy(configFiles.map(load));
    const scriptSrc = valuesFor(policy, "script-src");

    expect(new Set(scriptSrc).size).toBe(scriptSrc.length);
    expect(scriptSrc).toContain("https://polaris.cps.gov.uk");
    expect(scriptSrc).toContain("https://polaris-qa-notprod.cps.gov.uk");
    expect(scriptSrc).toContain("https://polaris-uat-notprod.cps.gov.uk");
  });
});
