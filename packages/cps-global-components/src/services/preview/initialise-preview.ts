import { getArtifactUrl } from "../../utils/get-artifact-url";
import { Result } from "../../utils/Result";
import { Preview } from "./Preview";

export const initialisePreview = async ({ rootUrl }: { rootUrl: string }): Promise<Result<Preview>> => {
  try {
    const response = await fetch(getArtifactUrl(rootUrl, "../state/preview"), { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Response status: ${response.status} ${response.statusText}`);
    }
    const result = (await response.json()) as Preview;
    return { found: true, result };
  } catch (error) {
    return { found: false, error };
  }
};
