import { Env } from "@stencil/core";

export const SURVEY_LINK = Env.SURVEY_LINK;
export const SHOULD_SHOW_HEADER = Env.SHOULD_SHOW_HEADER === "true";
export const SHOULD_SHOW_MENU = Env.SHOULD_SHOW_MENU === "true";
export const APP_INSIGHTS_KEY = Env.APP_INSIGHTS_KEY;
export const ENVIRONMENT = Env.ENVIRONMENT;

console.debug({ SURVEY_LINK, SHOULD_SHOW_HEADER, SHOULD_SHOW_MENU, APP_INSIGHTS_KEY, ENVIRONMENT });
