import { CmsSessionHint } from "./CmsSessionHint";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { getArtifactUrl } from "../../utils/get-artifact-url";
import { Result } from "../../utils/Result";

export const initialiseCmsSessionHint = async ({ rootUrl, flags: { isOverrideMode } }: { rootUrl: string; flags: ApplicationFlags }): Promise<Result<CmsSessionHint>> => {
  if (!isOverrideMode) {
    return { found: false, error: new Error("Not enabled") };
  }
  try {
    const response = await fetch(getArtifactUrl(rootUrl, "../cms-session-hint"), { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Response status: ${response.status} ${response.statusText}`);
    }
    const result = (await response.json()) as CmsSessionHint;

    return { found: true, result };
  } catch (error) {
    return { found: false, error };
  }
};
