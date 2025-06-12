import { ConfigFetch } from "../config/ConfigFetch";
import { isOverrideMode } from "./is-override-mode";

export const tryFetchOverrideConfig: ConfigFetch = async (configUrl: string) =>
  isOverrideMode() ? await fetch(configUrl.replace(".json", ".override.json")) : { ok: false, json: () => Promise.resolve(null) };
