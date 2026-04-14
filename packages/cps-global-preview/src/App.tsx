import { useState, useEffect, useCallback } from "react";
import type { Notification, Preview } from "cps-global-configuration";
import { diffLines } from "diff";

const STATE_ENDPOINT = "/global-components/state/preview";
const DISMISSED_NOTIFICATIONS_ENDPOINT = "/global-components/state/dismissed-notifications";
const ENV_MATCH = window.location.pathname.match(/\/global-components\/([^/]+)\//);
const ENV = ENV_MATCH?.[1] ?? "test";
const CONFIG_ENDPOINT = `/global-components/${ENV}/config.json`;
const CONFIG_OVERRIDE_ENDPOINT = `/global-components/${ENV}/config.override.json`;
const NOTIFICATIONS_ENDPOINT = `/global-components/${ENV}/notification.json`;

type NotificationsResult =
  | { loaded: true; notifications: Notification[] }
  | { loaded: false; error: string };

type ConfigResult =
  | { loaded: true; content: string }
  | { loaded: false; error: string };

type TextInput = {
  key: keyof Preview;
  label: string;
};

type SubOption = {
  key: keyof Preview;
  label: string;
};

type RadioOption<T extends string> = {
  value: T;
  label: string;
};

type Feature = {
  key: keyof Preview;
  label: string;
  description: string;
  disabled: boolean;
  textInputs?: TextInput[];
  subOptions?: SubOption[];
  radioOptions?: RadioOption<string>[];
};

const CASE_MARKERS_OPTIONS: RadioOption<string>[] = [
  { value: "a", label: "Design A" },
  { value: "b", label: "Design B" },
];

const COLOUR_PALETTE_OPTIONS: RadioOption<string>[] = [
  { value: "gds", label: "GDS" },
  { value: "cps", label: "CPS" },
];

const FEATURES: Feature[] = [
  {
    key: "caseMarkers",
    label: "Case details",
    description:
      "Show the case details line in the header: URN, lead defendant name and case markers (monitoring codes).",
    disabled: false,
    radioOptions: CASE_MARKERS_OPTIONS,
  },
  {
    key: "newHeader",
    label: "New header",
    description: "Display the header with the latest blue GDS styling.",
    disabled: false,
    radioOptions: COLOUR_PALETTE_OPTIONS,
  },
  {
    key: "footer",
    label: "Global footer",
    description: "Display the same global footer on every app",
    disabled: false,
  },
  {
    key: "myRecentCasesOnHeader",
    label: "My recent cases on header",
    description:
      "Show a dropdown of the user's most recently visited cases in the global header.",
    disabled: false,
  },
  {
    key: "accessibility",
    label: "Accessibility",
    description: "Enable accessibility features (low contrast background).",
    disabled: false,
  },
  {
    key: "caseSearch",
    label: "Case search",
    description: "Show case search functionality.",
    disabled: true,
  },
  {
    key: "homePageNotification",
    label: "Home page notification",
    description:
      "Force the home page introductory sessions notification banner to appear, regardless of feature flag group membership.",
    disabled: false,
  },
  {
    key: "tabTitleUrn",
    label: "Tab title URN",
    description:
      "Prepend the case URN to the browser tab title when viewing a case.",
    disabled: false,
  },
];

type FeatureKey = Feature["key"];

type StatusType = "info" | "error" | "success";

export function App() {
  const [state, setState] = useState<Preview>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{
    message: string;
    type: StatusType;
  } | null>(null);
  const [config, setConfig] = useState<ConfigResult | null>(null);
  const [configOverride, setConfigOverride] = useState<ConfigResult | null>(
    null
  );
  const [notificationsResult, setNotificationsResult] =
    useState<NotificationsResult | null>(null);

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
      const data: Preview | null = await response.json();
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
    async (newState: Preview) => {
      try {
        // If all properties are falsy/undefined, send null to clear the cookie
        const hasAnyValue = Object.values(newState).some((v) => v);
        const body = hasAnyValue ? JSON.stringify(newState) : "null";

        const response = await fetch(STATE_ENDPOINT, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!response.ok) {
          throw new Error("Failed to save state");
        }
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

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch(NOTIFICATIONS_ENDPOINT, { credentials: "include" });
      if (!response.ok) {
        setNotificationsResult({ loaded: false, error: `HTTP ${response.status}` });
        return;
      }
      const json: { notifications?: Notification[] } = await response.json();
      setNotificationsResult({ loaded: true, notifications: json.notifications ?? [] });
    } catch (err) {
      setNotificationsResult({
        loaded: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleEnabledChange = (checked: boolean) => {
    const newState = { ...state, enabled: checked || undefined };
    setState(newState);
    saveState(newState);
  };

  const handleFeatureChange = (
    key: FeatureKey,
    checked: boolean,
    textInputs?: TextInput[],
    subOptions?: SubOption[],
    radioOptions?: RadioOption<string>[]
  ) => {
    // For features with radioOptions, set the first option as default when checked
    const value = radioOptions
      ? checked
        ? radioOptions[0].value
        : undefined
      : checked || undefined;
    const newState = { ...state, [key]: value };
    // Clear text inputs and sub-options when the feature is unchecked
    if (!checked) {
      if (textInputs) {
        for (const input of textInputs) {
          newState[input.key] = undefined;
        }
      }
      if (subOptions) {
        for (const option of subOptions) {
          newState[option.key] = undefined;
        }
      }
    }
    setState(newState);
    saveState(newState);
  };

  const handleSubOptionChange = (key: keyof Preview, checked: boolean) => {
    const newState = { ...state, [key]: checked || undefined };
    setState(newState);
    saveState(newState);
  };

  const handleRadioChange = (key: keyof Preview, value: string) => {
    const newState = { ...state, [key]: value };
    setState(newState);
    saveState(newState);
  };

  const handleTextInputChange = (key: keyof Preview, value: string) => {
    const newState = { ...state, [key]: value || undefined };
    setState(newState);
    saveState(newState);
  };

  const handleClearDismissedNotifications = useCallback(async () => {
    try {
      const response = await fetch(DISMISSED_NOTIFICATIONS_ENDPOINT, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "null",
      });
      if (!response.ok) {
        throw new Error("Failed to clear dismissed notifications");
      }
      showStatus("Dismissed notifications cleared.", "success");
    } catch (err) {
      showStatus(
        `Failed to clear dismissed notifications: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        "error"
      );
    }
  }, [showStatus]);

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

      <form>
        <div className="govuk-form-group">
          <fieldset className="govuk-fieldset">
            <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
              <h2 className="govuk-fieldset__heading">Features</h2>
            </legend>
            <div>
              {FEATURES.map(
                ({
                  key,
                  label,
                  description,
                  disabled,
                  textInputs,
                  subOptions,
                  radioOptions,
                }) => (
                  <div
                    key={key}
                    className="govuk-checkboxes"
                    data-module="govuk-checkboxes"
                    style={{ marginBottom: "10px" }}
                  >
                    <div className="govuk-checkboxes__item">
                      <input
                        className="govuk-checkboxes__input"
                        id={key}
                        name="features"
                        type="checkbox"
                        checked={!!state[key]}
                        disabled={loading || disabled}
                        onChange={(e) =>
                          handleFeatureChange(
                            key,
                            e.target.checked,
                            textInputs,
                            subOptions,
                            radioOptions
                          )
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
                      {radioOptions && state[key] && (
                        <div
                          className="govuk-checkboxes__conditional"
                          style={{ marginTop: "10px", paddingLeft: "15px" }}
                        >
                          <div
                            className="govuk-radios govuk-radios--small govuk-radios--inline"
                            data-module="govuk-radios"
                          >
                            {radioOptions.map((option) => (
                              <div
                                key={option.value}
                                className="govuk-radios__item"
                              >
                                <input
                                  className="govuk-radios__input"
                                  id={`${key}-${option.value}`}
                                  name={key}
                                  type="radio"
                                  value={option.value}
                                  checked={state[key] === option.value}
                                  disabled={loading || disabled}
                                  onChange={() =>
                                    handleRadioChange(key, option.value)
                                  }
                                />
                                <label
                                  className="govuk-label govuk-radios__label"
                                  htmlFor={`${key}-${option.value}`}
                                >
                                  {option.label}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {textInputs && state[key] && (
                        <div
                          className="govuk-checkboxes__conditional"
                          style={{ marginTop: "10px", paddingLeft: "15px" }}
                        >
                          {textInputs.map((input) => (
                            <div
                              key={input.key}
                              className="govuk-form-group"
                              style={{ marginBottom: "10px" }}
                            >
                              <label
                                className="govuk-label govuk-!-font-size-16"
                                htmlFor={input.key}
                              >
                                {input.label}
                              </label>
                              <input
                                className="govuk-input govuk-input--width-10"
                                id={input.key}
                                name={input.key}
                                type="text"
                                value={String(state[input.key] ?? "")}
                                disabled={loading || disabled}
                                onChange={(e) =>
                                  handleTextInputChange(
                                    input.key,
                                    e.target.value
                                  )
                                }
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {subOptions && state[key] && (
                        <div
                          className="govuk-checkboxes__conditional"
                          style={{ marginTop: "10px", paddingLeft: "15px" }}
                        >
                          <div className="govuk-checkboxes govuk-checkboxes--small">
                            {subOptions.map((option) => (
                              <div
                                key={option.key}
                                className="govuk-checkboxes__item"
                              >
                                <input
                                  className="govuk-checkboxes__input"
                                  id={option.key}
                                  name={option.key}
                                  type="checkbox"
                                  checked={!!state[option.key]}
                                  disabled={loading || disabled}
                                  onChange={(e) =>
                                    handleSubOptionChange(
                                      option.key,
                                      e.target.checked
                                    )
                                  }
                                />
                                <label
                                  className="govuk-label govuk-checkboxes__label"
                                  htmlFor={option.key}
                                >
                                  {option.label}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </fieldset>
        </div>

        <div className="govuk-form-group">
          <fieldset className="govuk-fieldset">
            <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
              <h2 className="govuk-fieldset__heading">Notifications</h2>
            </legend>
            <div className="govuk-checkboxes" data-module="govuk-checkboxes">
              <div className="govuk-checkboxes__item">
                <input
                  className="govuk-checkboxes__input"
                  id="notifications"
                  name="notifications"
                  type="checkbox"
                  checked={state.notifications ?? false}
                  disabled={loading}
                  onChange={(e) => handleSubOptionChange("notifications", e.target.checked)}
                />
                <label
                  className="govuk-label govuk-checkboxes__label"
                  htmlFor="notifications"
                >
                  Preview outage notifications
                </label>
                <div
                  id="notifications-hint"
                  className="govuk-hint govuk-checkboxes__hint govuk-!-font-size-16"
                >
                  Show notifications marked <code>previewModeRequired: true</code> in{" "}
                  <code>notification.json</code>. Use to verify an outage message before
                  opening it up to all users.
                </div>
              </div>
            </div>
            <p className="govuk-body govuk-!-font-size-16 govuk-!-margin-top-4">
              Clears the cookie recording which outage/maintenance notifications you have
              dismissed. Active notifications will reappear on your next page load.
            </p>
            <button
              type="button"
              className="govuk-button govuk-button--secondary"
              onClick={handleClearDismissedNotifications}
            >
              Clear dismissed notifications
            </button>

            <h3 className="govuk-heading-s govuk-!-margin-top-6">Deployed notifications</h3>
            <p className="govuk-body govuk-!-font-size-16">
              Read-only view of <code>notification.json</code> loaded from blob storage
              for the <strong>{ENV}</strong> environment. Edit the source file to change
              what appears here.
            </p>
            {notificationsResult === null && (
              <p className="govuk-body govuk-!-font-size-16">Loading&hellip;</p>
            )}
            {notificationsResult?.loaded === false && (
              <p className="govuk-body govuk-!-font-size-16">
                Could not load notifications: {notificationsResult.error}
              </p>
            )}
            {notificationsResult?.loaded && notificationsResult.notifications.length === 0 && (
              <p className="govuk-body govuk-!-font-size-16">
                No notifications configured for this environment.
              </p>
            )}
            {notificationsResult?.loaded &&
              notificationsResult.notifications.map((n, index) => (
                <fieldset
                  key={n.id ?? index}
                  className="govuk-fieldset govuk-!-margin-top-4 govuk-!-padding-3"
                  style={{ border: "1px solid #b1b4b6" }}
                >
                  <legend className="govuk-fieldset__legend govuk-fieldset__legend--s">
                    Notification {index + 1}
                  </legend>
                  {(
                    [
                      ["id", "ID", "text", n.id],
                      ["severity", "Severity", "text", n.severity],
                      ["titleText", "Title text", "text", n.titleText ?? ""],
                      ["heading", "Heading", "text", n.heading ?? ""],
                      ["from", "From", "text", n.from ?? ""],
                      ["to", "To", "text", n.to ?? ""],
                    ] as const
                  ).map(([field, label, type, value]) => (
                    <div className="govuk-form-group" key={field}>
                      <label
                        className="govuk-label govuk-!-font-size-16"
                        htmlFor={`notif-${index}-${field}`}
                      >
                        {label}
                      </label>
                      <input
                        id={`notif-${index}-${field}`}
                        type={type}
                        className="govuk-input govuk-!-font-size-16"
                        value={value}
                        disabled
                      />
                    </div>
                  ))}
                  <div className="govuk-form-group">
                    <label
                      className="govuk-label govuk-!-font-size-16"
                      htmlFor={`notif-${index}-bodyHtml`}
                    >
                      Body HTML
                    </label>
                    <textarea
                      id={`notif-${index}-bodyHtml`}
                      className="govuk-textarea govuk-!-font-size-16"
                      value={n.bodyHtml}
                      rows={4}
                      disabled
                    />
                  </div>
                  <div className="govuk-checkboxes" data-module="govuk-checkboxes">
                    {(
                      [
                        ["previewModeRequired", "Preview mode required", n.previewModeRequired],
                        ["dismissible", "Dismissible", n.dismissible ?? true],
                      ] as const
                    ).map(([field, label, checked]) => (
                      <div className="govuk-checkboxes__item" key={field}>
                        <input
                          className="govuk-checkboxes__input"
                          id={`notif-${index}-${field}`}
                          type="checkbox"
                          checked={!!checked}
                          disabled
                          readOnly
                        />
                        <label
                          className="govuk-label govuk-checkboxes__label"
                          htmlFor={`notif-${index}-${field}`}
                        >
                          {label}
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>
              ))}
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
