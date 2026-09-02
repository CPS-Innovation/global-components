import { useState, useEffect, useCallback, useRef } from "react";
import { SettingsSchema, type Settings } from "cps-global-configuration";

const STATE_ENDPOINT = "/global-components/state/settings";

// Whether the case URN is shown at the start of the browser tab title. It is
// stored (inverted) as the `preventUrnPrependInTabTitle` setting and consumed
// by initialise-tab-title.
//   "yes" (show URN)     -> preventUrnPrependInTabTitle = undefined
//   "no"  (do not show)  -> preventUrnPrependInTabTitle = true
type ShowUrn = "yes" | "no";

// Tone of the low-contrast page surface, applied by accessibility-subscriber.
// This control used to live on the Accessibility Preview page (App.tsx) — if it
// needs to go back there, that is where it came from. "off" is this form's way
// of expressing `accessibilityBackground: undefined`.
type Tone = "off" | NonNullable<Settings["accessibilityBackground"]>;

const TONE_OPTIONS: readonly { value: Tone; label: string; hint?: string }[] = [
  { value: "off", label: "Off" },
  { value: "soft-grey", label: "Soft grey" },
  { value: "warm", label: "Warm", hint: "Easier on the eyes over long periods of reading." },
];

// Modelled on the accessibility-settings-guide GOV.UK prototype:
//   form -> check your answers -> confirmation.
type Step = "form" | "check" | "confirmation";

const showUrnFromSettings = (settings: Settings): ShowUrn => (settings.preventUrnPrependInTabTitle ? "no" : "yes");

const toneFromSettings = (settings: Settings): Tone => settings.accessibilityBackground ?? "off";

const toneLabel = (tone: Tone): string => TONE_OPTIONS.find(({ value }) => value === tone)?.label ?? "Off";

export function SettingsApp() {
  const [step, setStep] = useState<Step>("form");
  // Everything the endpoint holds. We preserve fields we do not manage here so
  // saving this page's answers never clobbers them.
  const [settings, setSettings] = useState<Settings>({});
  const [showUrn, setShowUrn] = useState<ShowUrn>("yes");
  const [tone, setTone] = useState<Tone>("off");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Focus management. Each stage is an in-place React swap, not a page load, so
  // nothing is announced automatically. Moving focus to the new stage's heading
  // makes JAWS read it — the SPA equivalent of the navigation the GOV.UK
  // multi-page flow relies on.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  const STAGE_TITLES: Record<Step, string> = {
    form: "Settings",
    check: "Check your answers",
    confirmation: "Your accessibility settings have been updated",
  };

  useEffect(() => {
    // Do not steal focus on the initial page load — only on stage changes.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    document.title = `${STAGE_TITLES[step]} - CPS Global Components`;
  }, [step]);

  // When a problem appears, move focus to the error summary so it is announced
  // and the user can act on it.
  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  const loadState = useCallback(async () => {
    try {
      const response = await fetch(STATE_ENDPOINT, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to load settings");
      }
      // Parse rather than trust the raw JSON: the schema coerces the legacy
      // "light-grey" tone to "soft-grey", so a long-standing opt-in still matches
      // a radio instead of reading as "off" and being saved away. An unparseable
      // (or null, i.e. never set) payload means "no settings yet" — the defaults.
      const parsed = SettingsSchema.safeParse(await response.json());
      const data = parsed.success ? parsed.data : {};
      setSettings(data);
      setShowUrn(showUrnFromSettings(data));
      setTone(toneFromSettings(data));
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
      const newState: Settings = {
        ...settings,
        preventUrnPrependInTabTitle: showUrn === "no" ? true : undefined,
        accessibilityBackground: tone === "off" ? undefined : tone,
      };
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
  }, [settings, showUrn, tone]);

  const handleSaveAndContinue = async () => {
    setError(null);
    const success = await save();
    if (success) {
      setStep("confirmation");
    }
  };

  const errorSummary = error && (
    <div className="govuk-error-summary" data-module="govuk-error-summary" ref={errorRef} tabIndex={-1}>
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
          <h1 className="govuk-heading-l" ref={headingRef} tabIndex={-1}>
            Settings
          </h1>
          <p className="govuk-body">Use this page to define your accessibility settings.</p>

          {errorSummary}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep("check");
            }}
          >
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

            <div className="govuk-form-group">
              <fieldset className="govuk-fieldset" aria-describedby="background-hint">
                <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">Low contrast background</legend>
                <div id="background-hint" className="govuk-hint">
                  Reduces the harsh glare of the bright white page background to make the service easier on the eyes over long periods, while keeping
                  text dark and readable.
                </div>
                <div className="govuk-radios" data-module="govuk-radios">
                  {TONE_OPTIONS.map(({ value, label, hint }) => (
                    <div className="govuk-radios__item" key={value}>
                      <input
                        className="govuk-radios__input"
                        id={`background-${value}`}
                        name="background"
                        type="radio"
                        value={value}
                        checked={tone === value}
                        disabled={loading}
                        aria-describedby={hint ? `background-${value}-hint` : undefined}
                        onChange={() => setTone(value)}
                      />
                      <label className="govuk-label govuk-radios__label" htmlFor={`background-${value}`}>
                        {label}
                      </label>
                      {hint && (
                        <div id={`background-${value}-hint`} className="govuk-hint govuk-radios__hint">
                          {hint}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="govuk-button-group">
              <button type="submit" className="govuk-button" data-module="govuk-button" disabled={loading}>
                Continue
              </button>
            </div>
          </form>

          {/* Not a setting we own — it is a browser flag the user sets themselves — so it sits
              outside the form and its check-answers flow, as collapsed guidance. The Dark Reader
              extension route stays on the Accessibility Preview page: it needs an install, which
              is a heavier ask than flipping a flag. */}
          <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

          <h2 className="govuk-heading-m">Dark mode</h2>
          <p className="govuk-body">
            Microsoft Edge has a built-in experimental feature that forces dark mode on all websites, including CPS services.
          </p>

          <details className="govuk-details">
            <summary className="govuk-details__summary">
              <span className="govuk-details__summary-text">How to turn on experimental dark mode</span>
            </summary>
            <div className="govuk-details__text">
              <ol className="govuk-list govuk-list--number">
                <li>
                  Open a new tab and type <code>edge://flags/#enable-force-dark</code> in the address bar, then press Enter
                </li>
                <li>
                  Find the setting labelled <strong>Auto Dark Mode for Web Contents</strong>
                </li>
                <li>
                  Change the dropdown from <strong>Default</strong> to <strong>Enabled</strong>
                </li>
                <li>
                  Click <strong>Restart</strong> at the bottom of the page to apply the changes
                </li>
              </ol>
              <p className="govuk-body govuk-!-font-size-16">
                <strong>Note:</strong> This is an experimental feature and may not work perfectly on all websites. You can
                disable it by returning to the flags page and setting it back to <strong>Default</strong>.
              </p>
            </div>
          </details>
        </div>
      </div>
    );
  }

  if (step === "check") {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-l" ref={headingRef} tabIndex={-1}>
            Check your answers
          </h1>

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
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Low contrast background</dt>
              <dd className="govuk-summary-list__value">{toneLabel(tone)}</dd>
              <dd className="govuk-summary-list__actions">
                <a className="govuk-link" href="#" onClick={(e) => { e.preventDefault(); setStep("form"); }}>
                  Change<span className="govuk-visually-hidden"> low contrast background</span>
                </a>
              </dd>
            </div>
          </dl>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveAndContinue();
            }}
          >
            <div className="govuk-button-group">
              <button type="submit" className="govuk-button" data-module="govuk-button">
                Save and continue
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <div className="govuk-panel govuk-panel--confirmation">
          <h1 className="govuk-panel__title" ref={headingRef} tabIndex={-1}>
            Your accessibility settings have been updated
          </h1>
        </div>

        {/* The page background is applied at page load by accessibility-subscriber, which has no
            live re-apply path — so a change to it only shows once a page loads again. We deliberately
            do not reload mid-flow: that would destroy the confirmation panel and the focus move that
            announces it. Instead the flow ends here and the reload is the user's own next step. */}
        <h2 className="govuk-heading-m">What happens next</h2>
        <p className="govuk-body">
          Your settings have been saved. If you changed the background, you will see it the next time a page loads.
        </p>
        <p className="govuk-body">
          <a className="govuk-link" href="#" onClick={(e) => { e.preventDefault(); window.location.reload(); }}>
            Return to your settings
          </a>
        </p>
      </div>
    </div>
  );
}
