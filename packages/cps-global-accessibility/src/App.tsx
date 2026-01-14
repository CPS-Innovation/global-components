import { useState, useEffect, useCallback } from "react";
import type { Settings } from "cps-global-configuration";

const STATE_ENDPOINT = "/global-components/state/settings";

type StatusType = "info" | "error" | "success";

export function App() {
  const [state, setState] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{
    message: string;
    type: StatusType;
  } | null>(null);

  const showStatus = useCallback((message: string, type: StatusType) => {
    setStatus({ message, type });
    if (type !== "error") {
      setTimeout(() => setStatus(null), 3000);
    }
  }, []);

  const loadState = useCallback(async () => {
    try {
      const response = await fetch(STATE_ENDPOINT, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to load settings");
      }
      const data: Settings | null = await response.json();
      if (data) {
        setState(data);
      }
    } catch (err) {
      showStatus(
        `Failed to load settings: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [showStatus]);

  const saveState = useCallback(
    async (newState: Settings): Promise<boolean> => {
      try {
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
        return true;
      } catch (err) {
        showStatus(
          `Failed to save settings: ${
            err instanceof Error ? err.message : "Unknown error"
          }`,
          "error"
        );
        return false;
      }
    },
    [showStatus]
  );

  useEffect(() => {
    loadState();
  }, [loadState]);

  const handleBackgroundChange = async (checked: boolean) => {
    const newState = { ...state, accessibilityBackground: checked || undefined };
    setState(newState);
    const success = await saveState(newState);
    if (success) {
      window.location.reload();
    }
  };

  return (
    <div className="accessibility-container">
      <style>{`
        .accessibility-container {
          max-width: 960px;
          margin: 0;
          padding: 20px;
        }
        .guidance-section {
          margin-top: 30px;
          padding: 20px;
          background: #f3f2f1;
          border-left: 4px solid #1d70b8;
        }
        .guidance-section h3 {
          margin-top: 0;
        }
        .guidance-section ol {
          padding-left: 20px;
        }
        .guidance-section li {
          margin-bottom: 10px;
        }
        .guidance-section code {
          background: #fff;
          padding: 2px 6px;
          border: 1px solid #b1b4b6;
          border-radius: 3px;
          font-family: monospace;
        }
      `}</style>

      <h1 className="govuk-heading-l">Accessibility Settings</h1>

      <p className="govuk-body">
        These settings help make the CPS services easier to use for extended periods.
        Choose the options that work best for you.
      </p>

      {status?.type === "error" && (
        <div className="govuk-error-summary" data-module="govuk-error-summary">
          <div role="alert">
            <h2 className="govuk-error-summary__title">There is a problem</h2>
            <div className="govuk-error-summary__body">
              <p>{status.message}</p>
            </div>
          </div>
        </div>
      )}


      {/* Section 1: Low Contrast Background */}
      <div className="govuk-form-group">
        <fieldset className="govuk-fieldset">
          <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
            <h2 className="govuk-fieldset__heading">Low contrast background</h2>
          </legend>
          <div id="background-hint" className="govuk-hint">
            Reduces the contrast of the page background to make it easier on the eyes
            when using the service for extended periods. This applies a subtle grey
            background across CPS services.
          </div>
          <div className="govuk-checkboxes" data-module="govuk-checkboxes">
            <div className="govuk-checkboxes__item">
              <input
                className="govuk-checkboxes__input"
                id="accessibilityBackground"
                name="accessibilityBackground"
                type="checkbox"
                checked={state.accessibilityBackground ?? false}
                disabled={loading}
                onChange={(e) => handleBackgroundChange(e.target.checked)}
                aria-describedby="background-hint"
              />
              <label
                className="govuk-label govuk-checkboxes__label"
                htmlFor="accessibilityBackground"
              >
                Enable low contrast background
              </label>
            </div>
          </div>
        </fieldset>
      </div>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      {/* Section 2: Dark Reader Extension */}
      <div className="guidance-section">
        <h3 className="govuk-heading-m">Dark Reader browser extension</h3>
        <p className="govuk-body">
          For a more comprehensive dark mode experience, you can use the Dark Reader
          extension. This is a heavier option but provides a wider effect across CPS
          services and other websites you visit.
        </p>
        <h4 className="govuk-heading-s">How to enable Dark Reader in Microsoft Edge:</h4>
        <ol className="govuk-body">
          <li>
            Open Microsoft Edge and go to the{" "}
            <a
              href="https://microsoftedge.microsoft.com/addons/detail/dark-reader/ifoakfbpdcdoeenechcleahebpibofpc"
              className="govuk-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Dark Reader extension page
            </a>
          </li>
          <li>Click <strong>Get</strong> to install the extension</li>
          <li>Once installed, click the Dark Reader icon in your toolbar</li>
          <li>Toggle the extension <strong>On</strong> to enable dark mode</li>
          <li>
            You can adjust brightness, contrast, and other settings to your preference
          </li>
        </ol>
        <p className="govuk-body govuk-!-font-size-16">
          <strong>Note:</strong> Dark Reader may affect page performance on complex pages.
          You can disable it for specific sites if needed.
        </p>
      </div>

      {/* Section 3: Edge Experimental Dark Mode */}
      <div className="guidance-section">
        <h3 className="govuk-heading-m">Edge experimental dark mode</h3>
        <p className="govuk-body">
          Microsoft Edge has a built-in experimental feature that forces dark mode on
          all websites. This achieves a similar effect to Dark Reader without needing
          an extension.
        </p>
        <h4 className="govuk-heading-s">How to enable experimental dark mode:</h4>
        <ol className="govuk-body">
          <li>
            Open a new tab and type <code>edge://flags/#enable-force-dark</code> in
            the address bar, then press Enter
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
          <strong>Note:</strong> This is an experimental feature and may not work
          perfectly on all websites. You can disable it by returning to the flags page
          and setting it back to <strong>Default</strong>.
        </p>
      </div>
    </div>
  );
}
