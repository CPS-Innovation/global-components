import { ZodType, z } from "zod";
import { Result } from "../../utils/Result";
import { getArtifactUrl } from "../../utils/get-artifact-url";

export const fetchState = async <T extends ZodType>({
  rootUrl,
  url,
  schema,
  data = undefined,
}: {
  rootUrl: string;
  url: string;
  schema: T;
  data?: any;
}): Promise<Result<z.infer<T>>> => {
  try {
    const resolvedUrl = getArtifactUrl(rootUrl, url);

    const requestInit: RequestInit =
      data !== undefined
        ? { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "include" }
        : // When getting, we need to send cookies as that is where the data is stored
          { credentials: "include" };

    const response = await fetch(resolvedUrl, requestInit);

    if (!response.ok) {
      throw new Error(`Call to ${resolvedUrl} returned non-ok status code: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    const result = schema.nullable().parse(responseData);
    if (result === null) {
      throw new Error(`User has no state at ${resolvedUrl}`);
    }

    return { found: true, result };
  } catch (error) {
    return { found: false, error };
  }
};
