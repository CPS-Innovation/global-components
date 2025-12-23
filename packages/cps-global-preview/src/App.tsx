import { useState, useEffect, useCallback } from "react";
import type { PreviewState } from "cps-global-configuration";
import { diffLines } from "diff";

const STATE_ENDPOINT = "/global-components/state/preview";
const CONFIG_ENDPOINT = "/global-components/test/config.json";
const CONFIG_OVERRIDE_ENDPOINT = "/global-components/test/config.override.json";

type ConfigResult =
  | { loaded: true; content: string }
  | { loaded: false; error: string };

const FEATURES = [
  {
    key: "caseMarkers",
    label: "Case details",
    description:
      "Show the case details line in the header: URN, lead defendant name and case markers (monitoring codes).",
    disabled: false,
  },
  {
    key: "newHeader",
    label: "New header",
    description: "Display the header with the latest blue GDS styling.",
    disabled: true,
  },
  {
    key: "caseSearch",
    label: "Case search",
    description: "Show case search functionality.",
    disabled: true,
  },
  {
    key: "myRecentCases",
    label: "My recent cases",
    description:
      "Track the user's most recently visited cases and display on the home page.",
    disabled: true,
  },

  {
    key: "accessibility",
    label: "Accessibility",
    description: "Enable accessibility features (low contrast background).",
    disabled: true,
  },
] as const;

const TACTICAL = [
  {
    key: "forceDcfHeader",
    label: "Force DCF header",
    description:
      "Force DCF cases to have the global header. Use until the team implement the change to get rid of the custom menu",
    disabled: false,
  },
] as const;

type FeatureKey = (typeof FEATURES)[number]["key"];
type TacticalKey = (typeof TACTICAL)[number]["key"];

type StatusType = "info" | "error" | "success";

export function App() {
  const [state, setState] = useState<PreviewState>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{
    message: string;
    type: StatusType;
  } | null>(null);
  const [config, setConfig] = useState<ConfigResult | null>(null);
  const [configOverride, setConfigOverride] = useState<ConfigResult | null>(
    null
  );

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
        throw new Error("Failed to load state");
      }
      const data: PreviewState | null = await response.json();
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
    async (newState: PreviewState) => {
      try {
        const response = await fetch(STATE_ENDPOINT, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newState),
        });
        if (!response.ok) {
          throw new Error("Failed to save state");
        }
        showStatus("Settings saved", "success");
      } catch (err) {
        showStatus(
          `Failed to save settings: ${
            err instanceof Error ? err.message : "Unknown error"
          }`,
          "error"
        );
      }
    },
    [showStatus]
  );

  useEffect(() => {
    loadState();
  }, [loadState]);

  const loadConfigs = useCallback(async () => {
    const fetchConfig = async (url: string): Promise<ConfigResult> => {
      try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) {
          return { loaded: false, error: `HTTP ${response.status}` };
        }
        const json = await response.json();
        return { loaded: true, content: JSON.stringify(json, null, 2) };
      } catch (err) {
        return {
          loaded: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    };

    const [configResult, overrideResult] = await Promise.all([
      fetchConfig(CONFIG_ENDPOINT),
      fetchConfig(CONFIG_OVERRIDE_ENDPOINT),
    ]);
    setConfig(configResult);
    setConfigOverride(overrideResult);
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const handleEnabledChange = (checked: boolean) => {
    const newState = { ...state, enabled: checked || undefined };
    setState(newState);
    saveState(newState);
  };

  const handleFeatureChange = (key: FeatureKey, checked: boolean) => {
    const newState = { ...state, [key]: checked || undefined };
    setState(newState);
    saveState(newState);
  };

  const handleTacticalChange = (key: TacticalKey, checked: boolean) => {
    const newState = { ...state, [key]: checked || undefined };
    setState(newState);
    saveState(newState);
  };

  const getDiffResult = () => {
    if (!config?.loaded || !configOverride?.loaded) return null;
    return diffLines(config.content, configOverride.content);
  };

  const diffResult = getDiffResult();

  return (
    <div className="preview-container">
      <style>{`
        .preview-container {
          max-width: 1200px;
          margin: 0;
          padding: 20px;
        }
        .config-diff {
          margin-top: 20px;
          background: #f3f2f1;
          border: 1px solid #b1b4b6;
          border-radius: 4px;
          overflow: hidden;
        }
        .config-diff-header {
          background: #1d70b8;
          color: white;
          padding: 8px 12px;
          font-weight: bold;
          font-family: "GDS Transport", arial, sans-serif;
        }
        .config-diff-content {
          padding: 0;
          margin: 0;
          font-family: monospace;
          font-size: 12px;
          overflow-x: auto;
          max-height: 600px;
          overflow-y: auto;
        }
        .diff-line {
          padding: 2px 8px;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .diff-added {
          background: #cce2d8;
          border-left: 3px solid #00703c;
        }
        .diff-removed {
          background: #f8d7da;
          border-left: 3px solid #d4351c;
        }
        .diff-unchanged {
          color: #505a5f;
        }
        .config-error {
          padding: 12px;
          color: #d4351c;
        }
        .config-loading {
          padding: 12px;
          color: #505a5f;
        }
        .diff-legend {
          display: flex;
          gap: 16px;
          margin-bottom: 8px;
          font-size: 14px;
          font-family: "GDS Transport", arial, sans-serif;
        }
        .diff-legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .diff-legend-color {
          width: 16px;
          height: 16px;
          border-radius: 2px;
        }
      `}</style>

      <h1 className="govuk-heading-l">Preview Settings</h1>

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

      {status?.type === "success" && (
        <div
          className="govuk-notification-banner govuk-notification-banner--success"
          role="alert"
          data-module="govuk-notification-banner"
        >
          <div className="govuk-notification-banner__header">
            <h2
              className="govuk-notification-banner__title"
              id="govuk-notification-banner-title"
            >
              Success
            </h2>
          </div>
          <div className="govuk-notification-banner__content">
            <p className="govuk-notification-banner__heading">
              {status.message}
            </p>
          </div>
        </div>
      )}

      <form>
        <div className="govuk-form-group">
          <fieldset className="govuk-fieldset">
            <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
              <h2 className="govuk-fieldset__heading">Features</h2>
            </legend>
            <div className="govuk-checkboxes" data-module="govuk-checkboxes">
              {FEATURES.map(({ key, label, description, disabled }) => (
                <div key={key} className="govuk-checkboxes__item">
                  <input
                    className="govuk-checkboxes__input"
                    id={key}
                    name="features"
                    type="checkbox"
                    checked={state[key] ?? false}
                    disabled={loading || disabled}
                    onChange={(e) => handleFeatureChange(key, e.target.checked)}
                  />
                  <label
                    className="govuk-label govuk-checkboxes__label"
                    htmlFor={key}
                  >
                    {label}
                  </label>
                  <div
                    id={`${key}-hint`}
                    className="govuk-hint govuk-checkboxes__hint govuk-!-font-size-16"
                  >
                    {description}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="govuk-form-group">
          <fieldset className="govuk-fieldset">
            <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
              <h2 className="govuk-fieldset__heading">Tactical</h2>
            </legend>
            <div className="govuk-checkboxes" data-module="govuk-checkboxes">
              {TACTICAL.map(({ key, label, description, disabled }) => (
                <div key={key} className="govuk-checkboxes__item">
                  <input
                    className="govuk-checkboxes__input"
                    id={key}
                    name="tactical"
                    type="checkbox"
                    checked={state[key] ?? false}
                    disabled={loading || disabled}
                    onChange={(e) =>
                      handleTacticalChange(key, e.target.checked)
                    }
                  />
                  <label
                    className="govuk-label govuk-checkboxes__label"
                    htmlFor={key}
                  >
                    {label}
                  </label>
                  <div
                    id={`${key}-hint`}
                    className="govuk-hint govuk-checkboxes__hint govuk-!-font-size-16"
                  >
                    {description}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="govuk-form-group">
          <fieldset className="govuk-fieldset">
            <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
              <h2 className="govuk-fieldset__heading">Override mode</h2>
            </legend>
            <div className="govuk-checkboxes" data-module="govuk-checkboxes">
              <div className="govuk-checkboxes__item">
                <input
                  className="govuk-checkboxes__input"
                  id="enabled"
                  name="enabled"
                  type="checkbox"
                  checked={state.enabled ?? false}
                  disabled={loading}
                  onChange={(e) => handleEnabledChange(e.target.checked)}
                />
                <label
                  className="govuk-label govuk-checkboxes__label"
                  htmlFor="enabled"
                >
                  Enable override configuration
                </label>
                <div
                  id="enabled-hint"
                  className="govuk-hint govuk-checkboxes__hint govuk-!-font-size-16"
                >
                  The override configuration file allows us to investigate
                  configuration changes in QA environment before making them
                  available to users. Don't enable this unless you know what you
                  are doing!
                </div>
              </div>
            </div>
          </fieldset>
        </div>
      </form>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <h2 className="govuk-heading-m">Configuration Comparison</h2>
      <p className="govuk-body govuk-!-font-size-16">
        Comparing config.json with config.override.json.
      </p>

      <div className="diff-legend">
        <div className="diff-legend-item">
          <div
            className="diff-legend-color"
            style={{ background: "#cce2d8", borderLeft: "3px solid #00703c" }}
          />
          <span>Added in override</span>
        </div>
        <div className="diff-legend-item">
          <div
            className="diff-legend-color"
            style={{ background: "#f8d7da", borderLeft: "3px solid #d4351c" }}
          />
          <span>Removed from base</span>
        </div>
      </div>

      <div className="config-diff">
        <div className="config-diff-header">
          config.json → config.override.json
        </div>
        <div className="config-diff-content">
          {(config === null || configOverride === null) && (
            <div className="config-loading">Loading...</div>
          )}
          {config?.loaded === false && (
            <div className="config-error">
              Error loading config.json: {config.error}
            </div>
          )}
          {configOverride?.loaded === false && (
            <div className="config-error">
              Error loading config.override.json: {configOverride.error}
            </div>
          )}
          {diffResult &&
            diffResult.map((part, i) => {
              const className = part.added
                ? "diff-line diff-added"
                : part.removed
                ? "diff-line diff-removed"
                : "diff-line diff-unchanged";
              return part.value.split("\n").map((line, j) =>
                line || j < part.value.split("\n").length - 1 ? (
                  <div key={`${i}-${j}`} className={className}>
                    {part.added ? "+ " : part.removed ? "- " : "  "}
                    {line}
                  </div>
                ) : null
              );
            })}
        </div>
      </div>
    </div>
  );
}
