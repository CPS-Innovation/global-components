import { useCallback, useState } from "react";

// TEMPORARY (FCT2-22305): a one-off check, from a real browser on the real page, that the proxy's
// analytics route delivers to the App Insights component in the prod subscription before every user
// is switched over to it. Remove this file and its two lines in App.tsx once the test has been run.
const TRACK_ENDPOINT = "/global-components/analytics/v2/track";
const PROD_INSTRUMENTATION_KEY = "7b67fd50-e1eb-42d5-88e4-8975559f79d7";
const EVENT_NAME = "cutover-test";

type Outcome = { ok: boolean; message: string };

export const CutoverTest = () => {
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const handleSend = useCallback(async () => {
    setSending(true);
    setOutcome(null);
    const time = new Date().toISOString();
    try {
      const response = await fetch(TRACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Microsoft.ApplicationInsights.Event",
          time,
          iKey: PROD_INSTRUMENTATION_KEY,
          data: {
            baseType: "EventData",
            baseData: {
              ver: 2,
              name: EVENT_NAME,
              properties: { sentVia: "preview-page", host: window.location.host },
            },
          },
        }),
      });
      const text = await response.text();
      setOutcome({
        ok: response.ok,
        message: `${time} — HTTP ${response.status}: ${text}`,
      });
    } catch (err) {
      setOutcome({
        ok: false,
        message: `${time} — request failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setSending(false);
    }
  }, []);

  return (
    <div className="govuk-form-group">
      <h2 className="govuk-heading-m" id="section-cutover-test">
        Prod analytics cutover test (temporary)
      </h2>
      <p className="govuk-body govuk-!-font-size-16">
        Sends one <code>{EVENT_NAME}</code> event through this host's analytics route to the App Insights
        component in the prod subscription. It is a custom event that no report reads. Check for it in{" "}
        <code>AppEvents</code> in the prod workspace a few minutes after sending.
      </p>
      <button
        type="button"
        className="govuk-button govuk-button--secondary"
        disabled={sending}
        onClick={handleSend}
      >
        Send cutover test event
      </button>
      {outcome && (
        <p className="govuk-body govuk-!-font-size-16">
          <strong>{outcome.ok ? "Sent." : "Failed."}</strong> <code>{outcome.message}</code>
        </p>
      )}
    </div>
  );
};
