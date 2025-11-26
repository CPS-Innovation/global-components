import { http, HttpResponse } from "msw";

export const handlers = [
  http.get<{ id: string }>("/api/cases/:id/summary", ({ params }) =>
    HttpResponse.json({ caseId: parseInt(params.id, 10), urn: "12AB" + params.id, isDcfCase: parseInt(params.id, 10) % 2 === 0, somePii: "dangerous info" }),
  ),
];
