import { PreviewState, previewStateSchema } from "cps-global-configuration";
import { getArtifactUrl } from "../../utils/get-artifact-url";
import { Result } from "../../utils/Result";

export const initialisePreview = async ({ rootUrl }: { rootUrl: string }): Promise<Result<PreviewState>> => {
  try {
    const response = await fetch(getArtifactUrl(rootUrl, "../state/preview"), { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Response status: ${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    const parsed = previewStateSchema.nullable().parse(json);
    return parsed === null ? { found: false, error: new Error("Null preview state returned") } : { found: true, result: parsed };
  } catch (error) {
    return { found: false, error };
  }
};
