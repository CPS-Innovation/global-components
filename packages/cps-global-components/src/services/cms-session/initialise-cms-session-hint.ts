import { CmsSessionHint } from "./CmsSessionHint";
import { getArtifactUrl } from "../../utils/get-artifact-url";
import { Result } from "../../utils/Result";

export const initialiseCmsSessionHint = async ({ rootUrl }: { rootUrl: string }): Promise<Result<CmsSessionHint>> => {
  try {
    const response = await fetch(getArtifactUrl(rootUrl, "../cms-session-hint"), { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Response status: ${response.status} ${response.statusText}`);
    }
    const result = (await response.json()) as CmsSessionHint | null;

    return result === null ? { found: false, error: new Error("Null preview state returned") } : { found: true, result };
  } catch (error) {
    return { found: false, error };
  }
};
