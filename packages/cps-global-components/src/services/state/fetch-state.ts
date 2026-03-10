import { ZodType, z } from "zod";
import { Result } from "../../utils/Result";
import { getArtifactUrl } from "../../utils/get-artifact-url";

export const fetchState = async <T extends ZodType>({
  rootUrl,
  url,
  schema,
  data = undefined,
  defaultResultWhenNull = undefined,
}: {
  rootUrl: string;
  url: string;
  schema: T;
  data?: any;
  defaultResultWhenNull?: z.infer<T>;
}): Promise<Result<z.infer<T>>> => {
  try {
    const resolvedUrl = getArtifactUrl(rootUrl, url);

    const requestInit: RequestInit =
      data !== undefined
        ? { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "include" }
        : // When getting, we need to send cookies as that is where the data is stored.
          // "no-cache" ensures fetch always revalidates rather than serving from the browser's HTTP cache.
          { credentials: "include", cache: "no-cache" };

    const response = await fetch(resolvedUrl, requestInit);

    if (!response.ok) {
      throw new Error(`Call to ${resolvedUrl} returned non-ok status code: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    const result = schema.nullable().parse(responseData);
    if (result === null) {
      if (defaultResultWhenNull) {
        return { found: true, result: defaultResultWhenNull };
      } else {
        throw new Error(`User has no state at ${resolvedUrl}`);
      }
    }

    return { found: true, result };
  } catch (error) {
    return { found: false, error };
  }
};
