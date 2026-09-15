import { fetchAndValidate, httpStatus } from "./fetch-and-validate";
import { z } from "zod";

const schema = z.object({ name: z.string() });

// Duck-typed responses rather than `new Response(...)`: the jsdom Response in the
// stencil test env does not derive `ok` from the status code, so a real Response
// with status 403 misleadingly reports ok:true. fetchAndValidate only reads
// ok/status/statusText/json(), so a plain object is deterministic and sufficient.
const response = (init: { ok: boolean; status?: number; statusText?: string; body?: unknown }) =>
  ({
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    statusText: init.statusText ?? "",
    json: async () => init.body,
  }) as unknown as Response;

describe("fetchAndValidate", () => {
  it("returns the parsed data on an ok, schema-valid response", async () => {
    const fetchFn = jest.fn().mockResolvedValue(response({ ok: true, body: { name: "case-1" } }));

    await expect(fetchAndValidate(fetchFn, "/x", schema)).resolves.toEqual({ name: "case-1" });
  });

  it("throws on a non-ok response, attaching the HTTP status to the error", async () => {
    const fetchFn = jest.fn().mockResolvedValue(response({ ok: false, status: 403, statusText: "Forbidden" }));

    const error = await fetchAndValidate(fetchFn, "/x", schema).catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(httpStatus(error)).toBe(403);
  });

  it("throws on a schema-invalid response without an HTTP status", async () => {
    const fetchFn = jest.fn().mockResolvedValue(response({ ok: true, body: { name: 123 } }));

    const error = await fetchAndValidate(fetchFn, "/x", schema).catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(httpStatus(error)).toBeUndefined();
  });
});

describe("httpStatus", () => {
  it("reads the status off an error carrying one", () => {
    expect(httpStatus(Object.assign(new Error("nope"), { status: 500 }))).toBe(500);
  });

  it("returns undefined for a plain Error", () => {
    expect(httpStatus(new Error("network"))).toBeUndefined();
  });

  it("returns undefined for a non-error value", () => {
    expect(httpStatus("403")).toBeUndefined();
    expect(httpStatus(undefined)).toBeUndefined();
  });
});
