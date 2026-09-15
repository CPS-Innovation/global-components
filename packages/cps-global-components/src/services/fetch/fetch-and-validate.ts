import { ZodType, z } from "zod";

// Read the HTTP status off an error thrown by fetchAndValidate. Returns undefined
// for any error that didn't originate from a non-ok HTTP response (network errors,
// validation failures, etc.) so callers can branch on a specific status — e.g.
// distinguishing a 403 entitlement denial from a transient failure.
export const httpStatus = (error: unknown): number | undefined => {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return error instanceof Error && typeof status === "number" ? status : undefined;
};

export const fetchAndValidate = async <T extends ZodType>(fetchFn: typeof fetch, request: Parameters<typeof fetch>[0], zodType: T): Promise<z.infer<T>> => {
  const response = await fetchFn(request);

  if (!response.ok) {
    throw Object.assign(
      new Error(`Call to ${request instanceof Request ? request.url : request} returned non-ok status code: ${response.status} ${response.statusText}`),
      { status: response.status },
    );
  }

  const data = await response.json();
  const result = zodType.safeParse(data);

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.data;
};
