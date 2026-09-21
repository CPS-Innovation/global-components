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

    expect(wma).toHaveLength(2); // dublin + london, not four
  });

  it("ignores relative hrefs and non-OutSystems hosts", () => {
    expect(targets.every(t => t.url.includes("outsystemsenterprise.com"))).toBe(
      true,
    );
  });

  it("includes the handover page as its own kind", () => {
    expect(
      targets.filter(t => t.kind === "auth-handover").map(t => t.url),
    ).toContain(HANDOVER_URL);
  });

  it("adds the London twin of every Dublin target", () => {
    // The hand-listed version checked none of these.
    expect(targets.filter(t => t.region === "london").map(t => t.url)).toContain(
      "https://cpslon-tst.outsystemsenterprise.com/WorkManagementApp",
    );
  });

  it("produces one London target for each Dublin one", () => {
    const dublin = targets.filter(t => t.region === "dublin");
    const london = targets.filter(t => t.region === "london");

    expect(london).toHaveLength(dublin.length);
  });
});

describe("against the committed configs", () => {
  const targets = deriveAllCheckTargets(
    Object.fromEntries(ENVIRONMENTS.map(env => [env, loadConfig(env)])),
  );

  it("covers every OutSystems host the configs reference", () => {
    const hosts = new Set(targets.map(t => new URL(t.url).hostname));

    // The four Dublin hosts plus their London twins. The previous hand-written
    // list named three of these eight.
    expect([...hosts].sort()).toEqual([
      "cps-dev.outsystemsenterprise.com",
      "cps-tst.outsystemsenterprise.com",
      "cps-tst1.outsystemsenterprise.com",
      "cps.outsystemsenterprise.com",
      "cpslon-dev.outsystemsenterprise.com",
      "cpslon-tst.outsystemsenterprise.com",
      "cpslon-tst1.outsystemsenterprise.com",
      "cpslon.outsystemsenterprise.com",
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
