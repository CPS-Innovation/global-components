import { http, HttpResponse } from "msw";

// The preview state endpoint. Deployed, this is served per-user off the back of a
// cookie; locally it 404s, which leaves preview.result undefined and every
// preview-gated feature off — so the case-locking UI can never be seen at
// `pnpm dev` without this.
//
// Which of the two case-locking UIs you get is driven by the page's own query
// string, because they trigger on the same condition and showing both at once
// tells you little:
//   ?ui=banner         the pinned notification only
//   ?ui=interstitial   the interruption card only
//   (absent)           both
const caseLockingPreview = () => {
  const ui = new URLSearchParams(window.location.search).get("ui");
  return {
    caseLocking: true,
    caseLockingNotifications: ui !== "interstitial",
    caseLockingInterstitial: ui !== "banner",
  };
};

export const handlers = [
  http.get("/state/preview", () =>
    HttpResponse.json({
      enabled: true,
      ...caseLockingPreview(),
    }),
  ),
  http.get<{ id: string }>("/api/global-components/cases/:id/summary", ({ params }) =>
    HttpResponse.json({
      id: parseInt(params.id, 10),
      urn: "12AB12121" + params.id,
      isDcfCase: parseInt(params.id, 10) % 2 === 0,
      somePii: "dangerous info",
      leadDefendantFirstNames: "Stefan",
      leadDefendantSurname: "Stachow",
      leadDefendantType: "",
      numberOfDefendants: 2,
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
      {
        code: "code",
        description: "Code description",
        type: "GLOBAL",
        disabled: false,
        isAssigned: true,
      },
      {
        code: "code",
        description: "Code description",
        type: "GLOBAL",
        disabled: false,
        isAssigned: true,
      },
      {
        code: "code",
        description: "Code description",
        type: "GLOBAL",
        disabled: false,
        isAssigned: true,
      },
      {
        code: "code",
        description: "Code description",
        type: "GLOBAL",
        disabled: false,
        isAssigned: true,
      },
      {
        code: "code",
        description: "Code description",
        type: "GLOBAL",
        disabled: false,
        isAssigned: true,
      },
      {
        code: "code",
        description: "Code description",
        type: "GLOBAL",
        disabled: false,
        isAssigned: true,
      },
      {
        code: "code",
        description: "Code description",
        type: "GLOBAL",
        disabled: false,
        isAssigned: true,
      },
      {
        code: "code",
        description: "Code description",
        type: "GLOBAL",
        disabled: false,
        isAssigned: true,
      },
      {
        code: "code",
        description: "Code description",
        type: "GLOBAL",
        disabled: false,
        isAssigned: true,
      },
      {
        code: "code",
        description: "Code description",
        type: "GLOBAL",
        disabled: false,
        isAssigned: true,
      },
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
