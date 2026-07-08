import { useState, useEffect, useCallback } from "react";
import type { Settings } from "cps-global-configuration";

const STATE_ENDPOINT = "/global-components/state/settings";

// The single control this page manages is whether the case URN is shown at the
// start of the browser tab title. It is stored (inverted) as the
// `preventUrnPrependInTabTitle` setting and consumed by initialise-tab-title.
//   "yes" (show URN)     -> preventUrnPrependInTabTitle = undefined
//   "no"  (do not show)  -> preventUrnPrependInTabTitle = true
type ShowUrn = "yes" | "no";

// Modelled on the accessibility-settings-guide GOV.UK prototype:
//   form -> check your answers -> confirmation.
type Step = "form" | "check" | "confirmation";

const showUrnFromSettings = (settings: Settings): ShowUrn => (settings.preventUrnPrependInTabTitle ? "no" : "yes");

export function SettingsApp() {
  const [step, setStep] = useState<Step>("form");
  // Everything the endpoint holds. We preserve fields we do not manage here
  // (e.g. accessibilityBackground, owned by the Accessibility Preview page) so
  // saving this page's answer never clobbers them.
  const [settings, setSettings] = useState<Settings>({});
  const [showUrn, setShowUrn] = useState<ShowUrn>("yes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const response = await fetch(STATE_ENDPOINT, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to load settings");
      }
      const data: Settings | null = await response.json();
      if (data) {
        setSettings(data);
        setShowUrn(showUrnFromSettings(data));
      }
    } catch (err) {
      setError(`Failed to load settings: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const save = useCallback(async (): Promise<boolean> => {
    try {
      const newState: Settings = { ...settings, preventUrnPrependInTabTitle: showUrn === "no" ? true : undefined };
      const hasAnyValue = Object.values(newState).some((v) => v);
      const body = hasAnyValue ? JSON.stringify(newState) : "null";

      const response = await fetch(STATE_ENDPOINT, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!response.ok) {
        throw new Error("Failed to save settings");
      }
      setSettings(newState);
      return true;
    } catch (err) {
      setError(`Failed to save settings: ${err instanceof Error ? err.message : "Unknown error"}`);
      return false;
    }
  }, [settings, showUrn]);

  const handleSaveAndContinue = async () => {
    setError(null);
    const success = await save();
    if (success) {
      setStep("confirmation");
    }
  };

  const errorSummary = error && (
    <div className="govuk-error-summary" data-module="govuk-error-summary">
      <div role="alert">
        <h2 className="govuk-error-summary__title">There is a problem</h2>
        <div className="govuk-error-summary__body">
          <p>{error}</p>
        </div>
      </div>
    </div>
  );

  if (step === "form") {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-l">Accessibility settings</h1>
          <p className="govuk-body">Use this page to define your accessibility settings.</p>

          {errorSummary}

          <div className="govuk-form-group">
            <fieldset className="govuk-fieldset">
              <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
                Show the URN at the beginning of the tab name
              </legend>
              <div className="govuk-radios govuk-radios--inline" data-module="govuk-radios">
                {(
                  [
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ] as const
                ).map(({ value, label }) => (
                  <div className="govuk-radios__item" key={value}>
                    <input
                      className="govuk-radios__input"
                      id={`show-urn-${value}`}
                      name="show-urn"
                      type="radio"
                      value={value}
                      checked={showUrn === value}
                      disabled={loading}
                      onChange={() => setShowUrn(value)}
                    />
                    <label className="govuk-label govuk-radios__label" htmlFor={`show-urn-${value}`}>
                      {label}
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="govuk-button-group">
            <button type="button" className="govuk-button" data-module="govuk-button" disabled={loading} onClick={() => setStep("check")}>
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "check") {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <a href="#" className="govuk-back-link" onClick={(e) => { e.preventDefault(); setStep("form"); }}>
            Back
          </a>

          <h1 className="govuk-heading-l">Check your answers</h1>

          {errorSummary}

          <dl className="govuk-summary-list">
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Show the URN at the beginning of the tab name</dt>
              <dd className="govuk-summary-list__value">{showUrn === "yes" ? "Yes" : "No"}</dd>
              <dd className="govuk-summary-list__actions">
                <a className="govuk-link" href="#" onClick={(e) => { e.preventDefault(); setStep("form"); }}>
                  Change<span className="govuk-visually-hidden"> show the URN at the beginning of the tab name</span>
                </a>
              </dd>
            </div>
          </dl>

          <div className="govuk-button-group">
            <button type="button" className="govuk-button" data-module="govuk-button" onClick={handleSaveAndContinue}>
              Save and continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <div className="govuk-panel govuk-panel--confirmation">
          <h1 className="govuk-panel__title">Your accessibility settings have been updated</h1>
        </div>
      </div>
    </div>
  );
}
