import { Config } from "cps-global-configuration";
import { encode } from "./encoding";

export const arrange = async (config: Partial<Config>) => {
  const fullConfig = { ENVIRONMENT: "e2e", ...config };
  await page.setExtraHTTPHeaders({
    "x-config": encode(JSON.stringify(fullConfig)),
  });

  await page.goto("http://localhost:3000");
};
