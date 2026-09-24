import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isOutSystemsHostname } from "./is-outsystems-host";

/**
 * One OutSystems host per environment, written out literally in each config.
 * Moving an environment to another OS host (e.g. onto the oapps proxies) is a
 * find-and-replace across its config; this is what catches a URL or context
 * path that got missed — or a second host sneaking back in.
 */

const CONFIG_DIR = join(__dirname, "..", "..", "..", "configuration");
const ENVIRONMENTS = ["dev", "test", "uat", "prod"];

type Found = { urlHosts: string[]; pathHosts: string[] };

const collect = (node: unknown, found: Found, key?: string): Found => {
  if (typeof node === "string") {
    if (key === "path") {
      // A context path is a regex; its host is everything between the scheme
      // and the first "/", with escaped dots read as dots.
      const host = node.match(/^https?:\/\/([^/]+)/)?.[1]?.replace(/\\\./g, ".");
      if (host && /outsystemsenterprise|oapps/i.test(host)) {
        found.pathHosts.push(host.toLowerCase());
      }
    } else {
      for (const [, host] of node.matchAll(/https?:\/\/([^/?#"\s]+)/g)) {
        if (isOutSystemsHostname(host!)) {
          found.urlHosts.push(host!.toLowerCase());
        }
      }
    }
  } else if (Array.isArray(node)) {
    node.forEach(item => collect(item, found));
  } else if (node && typeof node === "object") {
    Object.entries(node).forEach(([childKey, value]) => collect(value, found, childKey));
  }
  return found;
};

describe.each(ENVIRONMENTS)("config.%s.json", env => {
  const { urlHosts, pathHosts } = collect(
    JSON.parse(readFileSync(join(CONFIG_DIR, `config.${env}.json`), "utf8")),
    { urlHosts: [], pathHosts: [] },
  );
  const [host] = urlHosts;

  it("names exactly one OutSystems host across its URLs", () => {
    expect(new Set(urlHosts).size).toBe(1);
  });

  it("matches that same host, and only that host, in every OutSystems context path", () => {
    expect(pathHosts.length).toBeGreaterThan(0);
    expect(new Set(pathHosts)).toEqual(new Set([host]));
  });
});
