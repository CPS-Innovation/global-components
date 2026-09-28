import { describe, test, expect, jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigFetch } from "./fetch-config";
import { loadConfig } from "./load-config";

const CONFIG_URL = "https://example.com/global-components/config.json";
const validConfig = JSON.parse(readFileSync(join(__dirname, "../../../configuration/config.prod.json"), "utf8"));

const respondingWith = (json: unknown): ConfigFetch => jest.fn<ConfigFetch>(async () => ({ ok: true, status: 200, statusText: "OK", json: async () => json }));
const notFound = (): ConfigFetch => jest.fn<ConfigFetch>(async () => ({ ok: false, status: 404, statusText: "Not Found", json: async () => ({}) }));
const throwing = (): ConfigFetch =>
  jest.fn<ConfigFetch>(async () => {
    throw new Error("network down");
  });

describe("loadConfig", () => {
  test("returns the transformed and validated config", async () => {
    const config = await loadConfig(CONFIG_URL, [respondingWith(validConfig)]);

    expect(config.ENVIRONMENT).toBe("prod");
    expect(config.CONTEXTS.every(context => "path" in context)).toBe(true);
  });

  test("resolves timed values", async () => {
    const timed = { ...validConfig, REPORT_ISSUE_LINK: { value: "https://new.example", "until 2000-01-01T00:00:00Z": "https://old.example" } };

    const config = await loadConfig(CONFIG_URL, [respondingWith(timed)]);

    expect(config.REPORT_ISSUE_LINK).toBe("https://new.example");
  });

  test("passes the config url to the source", async () => {
    const source = respondingWith(validConfig);

    await loadConfig(CONFIG_URL, [source]);

    expect(source).toHaveBeenCalledWith(CONFIG_URL);
  });

  test("throws a validation error for an invalid config", async () => {
    const { ENVIRONMENT, ...invalid } = validConfig;

    await expect(loadConfig(CONFIG_URL, [respondingWith(invalid)])).rejects.toThrow(/^Config validation error: /);
  });

  test("uses the first source that responds ok", async () => {
    const second = respondingWith({ ...validConfig, ENVIRONMENT: "second" });

    const config = await loadConfig(CONFIG_URL, [respondingWith({ ...validConfig, ENVIRONMENT: "first" }), second]);

    expect(config.ENVIRONMENT).toBe("first");
    expect(second).not.toHaveBeenCalled();
  });

  test("falls through a source that is not ok or throws", async () => {
    const config = await loadConfig(CONFIG_URL, [notFound(), throwing(), respondingWith(validConfig)]);

    expect(config.ENVIRONMENT).toBe("prod");
  });

  test("reports the status when the last source is not ok", async () => {
    await expect(loadConfig(CONFIG_URL, [throwing(), notFound()])).rejects.toThrow(`Config fetch from ${CONFIG_URL} returned 404 Not Found`);
  });

  test("rethrows when the last source throws", async () => {
    await expect(loadConfig(CONFIG_URL, [notFound(), throwing()])).rejects.toThrow("network down");
  });
});
