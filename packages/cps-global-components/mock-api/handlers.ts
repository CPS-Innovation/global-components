import { http, HttpResponse } from "msw";

export const handlers = [
  http.get<{ id: string }>("/api/global-components/cases/:id/summary", ({ params }) =>
    HttpResponse.json({
      id: parseInt(params.id, 10),
      urn: "12AB12121" + params.id,
      isDcfCase: parseInt(params.id, 10) % 2 === 0,
      somePii: "dangerous info",
      leadDefendantFirstNames: "Stefan",
      leadDefendantSurname: "Stachow",
      leadDefendantType: "",
    }),
  ),
  http.get<{ id: string }>("/api/global-components/cases/:id/monitoring-codes", () =>
    HttpResponse.json([
      {
        code: "code",
        description: "Code description",
        type: "GLOBAL",
        disabled: false,
        isAssigned: true,
      },
    ]),
  ),
];
