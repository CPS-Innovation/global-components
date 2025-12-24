import { ZodType, z } from "zod";

export const fetchAndValidate = async <T extends ZodType>(fetchFn: typeof fetch, request: Parameters<typeof fetch>[0], zodType: T): Promise<z.infer<T>> => {
  const response = await fetchFn(request);

  if (!response.ok) {
    throw new Error(`Call to ${request instanceof Request ? request.url : request} returned non-ok status code: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const result = zodType.safeParse(data);

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.data;
};
