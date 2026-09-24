import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isOutSystemsHostname } from "./is-outsystems-host";
import { listOsHostVariantFiles } from "./scripts/os-host-variant-files";

/**
 * One OutSystems host per config file, written out literally. Moving an
 * environment to another OS host is a find-and-replace across its config; this
 * is what catches a URL or context path that got missed — or a second host
 * sneaking back in.
 *
 * An environment may also have OS host variants (config.<env>.<variant>.json),
 * served by the proxy to users switched onto another OS host. A variant must be
 * its environment's config with the host swapped and nothing else, so the two
 * can never drift apart.
 */

const CONFIG_DIR = join(__dirname, "..", "..", "..", "configuration");
const ENVIRONMENTS = ["dev", "test", "uat", "prod"];

const VARIANTS = listOsHostVariantFiles(CONFIG_DIR);

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

const load = (file: string): unknown => JSON.parse(readFileSync(join(CONFIG_DIR, file), "utf8"));

const osHostOf = (file: string): string => collect(load(file), { urlHosts: [], pathHosts: [] }).urlHosts[0]!;

describe.each([...ENVIRONMENTS.map(env => `config.${env}.json`), ...VARIANTS.map(({ file }) => file)])("%s", file => {
  const { urlHosts, pathHosts } = collect(load(file), { urlHosts: [], pathHosts: [] });
  const [host] = urlHosts;

  it("names exactly one OutSystems host across its URLs", () => {
    expect(new Set(urlHosts).size).toBe(1);
  });

  it("matches that same host, and only that host, in every OutSystems context path", () => {
    expect(pathHosts.length).toBeGreaterThan(0);
    expect(new Set(pathHosts)).toEqual(new Set([host]));
  });
});

describe.each(VARIANTS)("$file", ({ file, env }) => {
  it(`is config.${env}.json with only the OS host swapped`, () => {
    const baseFile = `config.${env}.json`;
    const [from, to] = [osHostOf(baseFile), osHostOf(file)];
    // Context paths hold the host regex-escaped, which in the raw JSON text is
    // a doubled backslash before each dot.
    const escape = (host: string) => host.replace(/\./g, "\\\\.");
    const swapped = readFileSync(join(CONFIG_DIR, baseFile), "utf8").split(from).join(to).split(escape(from)).join(escape(to));

    expect(from).not.toBe(to);
    expect(load(file)).toEqual(JSON.parse(swapped));
  });
});
