import { Env } from "@stencil/core";
import { validateConfig } from "cps-global-configuration";

export const SURVEY_LINK = Env.SURVEY_LINK;
export const SHOULD_SHOW_HEADER = Env.SHOULD_SHOW_HEADER === "true";
export const SHOULD_SHOW_MENU = Env.SHOULD_SHOW_MENU === "true";
export const APP_INSIGHTS_KEY = Env.APP_INSIGHTS_KEY;
export const ENVIRONMENT = Env.ENVIRONMENT;

console.debug({ SURVEY_LINK, SHOULD_SHOW_HEADER, SHOULD_SHOW_MENU, APP_INSIGHTS_KEY, ENVIRONMENT });

const configUrl = new URL("./", import.meta.url).href + "config.json";

export const CONFIG_ASYNC = fetch(configUrl)
  .then(response => response.json())
  .then(json => {
    const { success, data, error } = validateConfig(json);
    if (!success) {
      throw new Error(`Invalid config JSON retrieved from ${configUrl}: ${JSON.stringify(error)}`);
    }
    return data;
  });
