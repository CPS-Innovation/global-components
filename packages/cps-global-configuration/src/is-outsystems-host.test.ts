import { isOutSystemsHostname, isOutSystemsUrl } from "./is-outsystems-host";

describe("isOutSystemsHostname", () => {
  it.each([
    "cps.outsystemsenterprise.com",
    "cps-tst.outsystemsenterprise.com",
    "CPS-TST1.outsystemsenterprise.com",
    "oapps.int.cps.gov.uk",
    "oapps-qa-notprod.int.cps.gov.uk",
    "oapps-dev-notprod.int.cps.gov.uk",
  ])("recognises %s", hostname => {
    expect(isOutSystemsHostname(hostname)).toBe(true);
  });

  it.each([
    "polaris-qa-notprod.cps.gov.uk",
    "polaris.cps.gov.uk",
    // Only the proxy hosts themselves, not anything else under cps.gov.uk that
    // happens to start with oapps.
    "oapps-evil.cps.gov.uk",
    "oapps.int.cps.gov.uk.example.com",
    // The proxies all live under int.cps.gov.uk.
    "oapps.cps.gov.uk",
    "oapps-qa-notprod.cps.gov.uk",
    "outsystemsenterprise.com.example.com",
    "notoutsystemsenterprise.com",
  ])("rejects %s", hostname => {
    expect(isOutSystemsHostname(hostname)).toBe(false);
  });
});

describe("isOutSystemsUrl", () => {
  it.each([
    ["https://oapps-qa-notprod.int.cps.gov.uk/WorkManagementApp/TaskList", true],
    ["https://cps-tst.outsystemsenterprise.com/Casework/home", true],
    ["https://polaris-qa-notprod.cps.gov.uk/polaris-ui", false],
    ["/cases/{caseId}", false],
    ["not a url", false],
  ])("isOutSystemsUrl(%s) is %s", (href, expected) => {
    expect(isOutSystemsUrl(href)).toBe(expected);
  });
});
