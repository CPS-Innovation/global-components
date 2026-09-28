import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transformAndValidateConfig } from "./validator";

const CONFIG_DIR = join(__dirname, "..", "..", "..", "configuration");
const load = (filename: string) => JSON.parse(readFileSync(join(CONFIG_DIR, filename), "utf8"));

describe("transformAndValidateConfig filename check", () => {
  it("accepts an OS host variant carrying its environment's ENVIRONMENT", () => {
    expect(transformAndValidateConfig(load("config.test.oapps.json"), "config.test.oapps.json").success).toBe(true);
  });

  it.each(["config.uat.json", "config.uat.oapps.json"])("rejects %s when ENVIRONMENT names another environment", filename => {
    const result = transformAndValidateConfig(load("config.test.json"), filename);

    expect(result).toEqual({ success: false, errorMsg: expect.stringContaining('does not match filename environment "uat"') });
  });
});
