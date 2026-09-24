import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveAllCheckTargets, deriveCheckTargets } from "./derive-check-targets";

const CONFIG_DIR = join(__dirname, "..", "..", "..", "..", "configuration");
const ENVIRONMENTS = ["dev", "test", "uat", "prod"];

const loadConfig = (env: string) =>
  JSON.parse(readFileSync(join(CONFIG_DIR, `config.${env}.json`), "utf8"));

describe("deriveCheckTargets", () => {
  const HANDOVER_URL =
    "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https://polaris-qa-notprod.cps.gov.uk/global-components/test/auth-handover.js";

  const config = {
    LINKS: [
      { href: "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/TaskList" },
      { href: "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/Cases" },
      { href: "https://cps-tst.outsystemsenterprise.com/CaseReview/LandingPage" },
      { href: "/cases/{caseId}" },
      { href: "https://polaris-qa-notprod.cps.gov.uk/auth-refresh-outbound" },
    ],
    OS_HANDOVER_URL: HANDOVER_URL,
  } as never;

  const targets = deriveCheckTargets("test", config);

  it("collapses several links in one module to a single probe", () => {
    const wma = targets.filter(t => t.url.endsWith("/WorkManagementApp"));

    expect(wma).toHaveLength(1);
  });

  it("ignores relative hrefs and non-OutSystems hosts", () => {
    expect(targets.map(t => new URL(t.url).hostname)).toEqual([
      "cps-tst.outsystemsenterprise.com",
      "cps-tst.outsystemsenterprise.com",
      "cps-tst.outsystemsenterprise.com",
    ]);
  });

  it("includes the handover page as its own kind", () => {
    expect(
      targets.filter(t => t.kind === "auth-handover").map(t => t.url),
    ).toEqual([HANDOVER_URL]);
  });

  // The checker follows OutSystems onto the oapps proxies without change.
  it("probes OutSystems on an oapps proxy host", () => {
    const oapps = deriveCheckTargets("test", {
      LINKS: [{ href: "https://oapps-qa-notprod.int.cps.gov.uk/WorkManagementApp/TaskList" }],
    } as never);

    expect(oapps.map(t => t.url)).toEqual([
      "https://oapps-qa-notprod.int.cps.gov.uk/WorkManagementApp",
    ]);
  });
});

describe("against the committed configs", () => {
  const targets = deriveAllCheckTargets(
    Object.fromEntries(ENVIRONMENTS.map(env => [env, loadConfig(env)])),
  );

  it("covers every OutSystems host the configs reference", () => {
    const hosts = new Set(targets.map(t => new URL(t.url).hostname));

    // One OutSystems host per environment. The previous hand-written list
    // named three of these four.
    expect([...hosts].sort()).toEqual([
      "cps-dev.outsystemsenterprise.com",
      "cps-tst.outsystemsenterprise.com",
      "cps-tst1.outsystemsenterprise.com",
      "cps.outsystemsenterprise.com",
    ]);
  });

  it("finds a handover target for every environment", () => {
    const handoverEnvironments = new Set(
      targets.filter(t => t.kind === "auth-handover").map(t => t.environment),
    );

    expect([...handoverEnvironments].sort()).toEqual([...ENVIRONMENTS].sort());
  });

  it("probes the Casework module at its current name, not Casework_blocks", () => {
    const paths = new Set(targets.map(t => new URL(t.url).pathname));

    expect([...paths]).toContain("/Casework");
    expect([...paths]).not.toContain("/Casework_blocks");
  });
});
