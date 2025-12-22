import { ZodType, z } from "zod";

export const fetchAndValidate = async <T extends ZodType>(fetchFn: typeof fetch, url: string, zodType: T): Promise<z.infer<T>> => {
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new Error(`Call to ${url} returned non-ok status code: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const result = zodType.safeParse(data);

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.data;
};
