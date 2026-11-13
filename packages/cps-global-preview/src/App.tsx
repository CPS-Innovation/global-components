import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import type { Notification, Preview } from "cps-global-configuration";

const STATE_ENDPOINT = "/global-components/state/preview";
const DISMISSED_NOTIFICATIONS_ENDPOINT = "/global-components/state/dismissed-notifications";
const ENV_MATCH = window.location.pathname.match(/\/global-components\/([^/]+)\//);
const ENV = ENV_MATCH?.[1] ?? "test";
const NOTIFICATIONS_ENDPOINT = `/global-components/${ENV}/notification.json`;
// The per-environment OS host switch, owned by the proxy's temporary
// os-london-dublin-oapps-switch module (infra/proxy/config/global-components.os-london-dublin-oapps-switch).
// It lives in its own cookie rather than preview state because the proxy reads it
// server-side, in both Edge and IE mode — so switching is a NAVIGATION through
// the set route, which visits both engines to write both cookie copies.
const OS_TARGET_STATUS_ENDPOINT = `/global-components/multi-os/target/${ENV}`;
const OS_TARGET_SET_ENDPOINT = "/global-components/multi-os/set";

type OsTarget = {
  current: string | null;
  options: { variant: string; host: string }[];
};

type NotificationsResult =
  | { loaded: true; notifications: Notification[] }
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
  // Also read in IE mode — by the CMS Classic and CMS Modern clients, which see
  // IE mode's own cookie jar, not Edge's. Changing one of these raises the
  // pinned "Copy to IE mode" bar until the settings have been copied across.
  copyToIeMode?: boolean;
};

const CASE_MARKERS_OPTIONS: RadioOption<string>[] = [
  { value: "a", label: "Design A" },
  { value: "b", label: "Design B" },
  { value: "off", label: "Off (force hide)" },
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
    key: "accessibilityBackground",
    label: "Accessibility — low contrast background setting",
    description:
      "Show the low contrast background control, and the Edge dark-mode guidance below it, on the Settings page. Separate from Accessibility above, which decides whether the Settings page is reachable at all; this decides only whether that part of it appears. Anyone who already has a tone saved keeps the control regardless, so they can always turn it off.",
    disabled: false,
  },
  {
    key: "caseSearch",
    label: "Case search",
    description: "Show case search functionality.",
    disabled: true,
  },
  {
    key: "tabTitleUrn",
    label: "Tab title URN",
    description:
      "Prepend the case URN to the browser tab title when viewing a case.",
    disabled: false,
  },
  {
    key: "forceSilentSso",
    label: "Force silent SSO",
    description:
      "Use the silent SSO cascade (ssoSilent) instead of the full-page MSAL redirect when the cached token is exhausted. Full-page redirect is what everyone gets; this is the way to exercise the silent path by hand.",
    disabled: false,
  },
  {
    key: "caseLockingCountSelf",
    label: "Case locking — count myself",
    description:
      "Count yourself among the present users, shown as \"(current user)\" after your name, in the web components and in CMS Classic and Modern. Off, you see the banner only when somebody else really is on the case — which is what keeps it out of the way of QA users working alone. On, it is the evidence that self-identification works at all: filtered out, an empty banner looks the same whether the mechanism works or presence is broken. You are never counted as a CLASH with yourself, so this cannot raise the interruption on a case only you are on.",
    disabled: false,
    copyToIeMode: true,
  },
  {
    key: "requestObservationShim",
    label: "Request observation shim",
    description:
      "Hook XMLHttpRequest to log the URL and body length of POST requests to the console. Diagnostic only — does not capture bodies or interfere with requests. Used to confirm we share the host app's XHR.",
    disabled: false,
  },
  {
    key: "openInCmsModern",
    label: "Open in CMS Modern",
    description:
      "Replace \"Open in CMS Classic\" with an \"Open in CMS…\" menu offering CMS Classic and CMS Modern. CMS Modern moves your open CMS Modern tab to the case; it can't open CMS Modern if it isn't already open. Already on for everyone in QA.",
    disabled: false,
  },
  {
    key: "verboseLogging",
    label: "Verbose logging",
    description:
      "Write Global Components' detailed debug messages to the browser console. Warnings and errors are always shown. To see the messages in Chrome or Edge, set the console's level to include Verbose. The CMS Classic and CMS Modern case locking clients follow it too.",
    disabled: false,
    copyToIeMode: true,
  },
];

type FeatureKey = Feature["key"];

// The settings IE mode reads, and a comparable snapshot of their values.
const IE_MODE_KEYS = FEATURES.filter((f) => f.copyToIeMode).map((f) => f.key);
const IE_MODE_LABELS = FEATURES.filter((f) => f.copyToIeMode).map((f) => f.label);
const ieModeSnapshot = (state: Preview) =>
  JSON.stringify(IE_MODE_KEYS.map((key) => state[key] ?? null));

// The IE-mode values as last copied (or as loaded, when nothing has been copied
// in this tab). Kept in sessionStorage so reloading the page before copying does
// not quietly drop the reminder. Best-effort: storage can throw or be missing,
// and if it does not survive the copy's trip through IE mode, the values loaded
// on return are the ones just copied — the same baseline anyway.
const IE_MODE_BASELINE_KEY = "cps-preview-ie-mode-baseline";
const readIeModeBaseline = (): string | null => {
  try {
    return window.sessionStorage.getItem(IE_MODE_BASELINE_KEY);
  } catch {
    return null;
  }
};
const writeIeModeBaseline = (snapshot: string) => {
  try {
    window.sessionStorage.setItem(IE_MODE_BASELINE_KEY, snapshot);
  } catch {
    // best-effort
  }
};

// A section heading that is its own #anchor, so sections can be linked to directly.
// Ids are prefixed "section-" to stay clear of the form inputs' ids.
const SectionHeading = ({ id, className, children }: { id: string; className: string; children: ReactNode }) => (
  <h2 className={className} id={`section-${id}`}>
    <a className="govuk-link govuk-link--text-colour govuk-link--no-underline" href={`#section-${id}`}>
      {children}
    </a>
  </h2>
);

type StatusType = "info" | "error" | "success";

export function App() {
  const [state, setState] = useState<Preview>({});
  const [loading, setLoading] = useState(true);
  const [ieModeBaseline, setIeModeBaseline] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    message: string;
    type: StatusType;
  } | null>(null);
  const [notificationsResult, setNotificationsResult] =
    useState<NotificationsResult | null>(null);
  const [osTarget, setOsTarget] = useState<OsTarget | null>(null);
  const scrolledToHash = useRef(false);

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
      setIeModeBaseline(readIeModeBaseline() ?? ieModeSnapshot(data ?? {}));
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

  const loadOsTarget = useCallback(async () => {
    try {
      const response = await fetch(OS_TARGET_STATUS_ENDPOINT, { credentials: "include" });
      if (response.ok) {
        setOsTarget(await response.json());
      }
    } catch {
      // No switch endpoint (e.g. an older proxy) — the section stays hidden.
    }
  }, []);

  useEffect(() => {
    loadOsTarget();
  }, [loadOsTarget]);

  // Sections render after async loads (the OutSystems host one only once its
  // status arrives), so the browser's own jump to the #anchor on load misses them.
  // Jump once, as soon as the target exists.
  useEffect(() => {
    if (scrolledToHash.current || !window.location.hash) {
      return;
    }
    const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target) {
      scrolledToHash.current = true;
      target.scrollIntoView();
    }
  }, [loading, osTarget, notificationsResult]);

  // Leaves the page: the set route writes the cookie in Edge, flips the tab to IE
  // mode to write IE mode's copy, then brings the tab back here.
  const handleOsTargetChange = (host: string) => {
    const query = new URLSearchParams({ env: ENV, host, return: window.location.pathname + window.location.search + "#section-os-host" });
    window.location.assign(`${OS_TARGET_SET_ENDPOINT}?${query}`);
  };

  // Push the current preview state into the IE-MODE COOKIE JAR as well as this one.
  //
  // Edge and IE mode keep SEPARATE cookie jars, and saveState above writes only
  // the jar of whichever engine this page is rendering in — Edge. CMS Classic
  // (document mode 5) and CMS Modern/DCF (11) read the other one, so until this
  // runs they see whatever preview was there last, or none at all.
  //
  // IT HAS TO BE A NAVIGATION. The engine is chosen by an X-InternetExplorerMode
  // response header on a TOP-LEVEL document load, so a fetch cannot do it and an
  // iframe cannot change its own mode. The set route writes this engine's copy,
  // flips the tab to the other engine to write that copy, then brings the tab
  // back here — the same trip as handleOsTargetChange above.
  //
  // DELIBERATELY NOT ON EVERY TOGGLE. This page has twenty-odd switches and
  // people flip several in a row; a reload per click would be unusable. So the
  // fast save stays as it is and this is a separate, explicit action — at the
  // cost that Edge can be a few toggles ahead of CMS until it is pressed.
  const handlePushToCms = () => {
    writeIeModeBaseline(ieModeSnapshot(state));
    const hasAnyValue = Object.values(state).some((v) => v);
    const query = new URLSearchParams({
      set: hasAnyValue ? JSON.stringify(state) : "null",
      return: window.location.pathname + window.location.search + "#section-cms-preview",
    });
    window.location.assign(`${STATE_ENDPOINT}?${query}`);
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

  const ieModeOutOfDate =
    !loading && ieModeBaseline !== null && ieModeSnapshot(state) !== ieModeBaseline;

  return (
    <div className={`preview-container${ieModeOutOfDate ? " preview-container--with-ie-bar" : ""}`}>
      <style>{`
        .preview-container {
          max-width: 1200px;
          margin: 0;
          padding: 20px;
        }
        /* Room for the pinned bar, so it never covers the last settings or the footer. */
        .preview-container--with-ie-bar {
          padding-bottom: 160px;
        }
        .ie-mode-bar {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1000;
          background: #ffffff;
          border-top: 5px solid #1d70b8;
          box-shadow: 0 -2px 8px rgba(11, 12, 12, 0.15);
          padding: 15px 0 0;
        }
        .ie-mode-bar__inner {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0 20px;
        }
        .ie-mode-bar__text {
          flex: 1 1 400px;
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
              <SectionHeading className="govuk-fieldset__heading" id="features">Features</SectionHeading>
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
                  copyToIeMode,
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
                        {copyToIeMode && (
                          <>
                            {" "}
                            <strong className="govuk-tag govuk-tag--blue">Also IE mode</strong>
                          </>
                        )}
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
              <SectionHeading className="govuk-fieldset__heading" id="notifications">Notifications</SectionHeading>
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

            <h3 className="govuk-heading-s govuk-!-margin-top-6" id="section-deployed-notifications">
              <a className="govuk-link govuk-link--text-colour govuk-link--no-underline" href="#section-deployed-notifications">
                Deployed notifications
              </a>
            </h3>
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
                      ["heading", "Heading", "text", n.heading ?? ""],
                      ["from", "From", "text", n.from ?? ""],
                      ["to", "To", "text", n.to ?? ""],
                      ["urlRegex", "URL regex", "text", n.urlRegex ?? ""],
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

        {osTarget && osTarget.options.length > 0 && (
          <div className="govuk-form-group">
            <fieldset className="govuk-fieldset">
              <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
                <SectionHeading className="govuk-fieldset__heading" id="os-host">OutSystems host</SectionHeading>
              </legend>
              <p className="govuk-body govuk-!-font-size-16">
                Which OutSystems host the proxied CMS C-button and the menu send you
                to in this environment. Changing it briefly reloads this page (it has
                to visit both Edge and IE mode to set the choice in each). Pages you
                open directly on either host keep working as they are.
              </p>
              <div className="govuk-radios govuk-radios--small" data-module="govuk-radios">
                {[{ variant: "", host: "" }, ...osTarget.options].map(({ variant, host }) => (
                  <div key={host || "default"} className="govuk-radios__item">
                    <input
                      className="govuk-radios__input"
                      id={`os-target-${variant || "default"}`}
                      name="osTarget"
                      type="radio"
                      checked={(osTarget.current ?? "") === host}
                      disabled={loading}
                      onChange={() => handleOsTargetChange(host)}
                    />
                    <label className="govuk-label govuk-radios__label" htmlFor={`os-target-${variant || "default"}`}>
                      {host ? `${variant} — ${host}` : "Default for this environment"}
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        <div className="govuk-form-group">
          <fieldset className="govuk-fieldset">
            <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
              <SectionHeading className="govuk-fieldset__heading" id="cms-preview">Preview inside CMS</SectionHeading>
            </legend>
            <p className="govuk-body govuk-!-font-size-16">
              Everything above takes effect in this browser straight away, but CMS
              Classic and CMS Modern run in Internet Explorer mode, which keeps its
              own separate set of cookies. The settings tagged <strong className="govuk-tag govuk-tag--blue">Also IE mode</strong>{" "}
              are read there too, so they need copying across: change one and a bar
              appears at the bottom of the page to do it.
            </p>
            <p className="govuk-body govuk-!-font-size-16">
              Copying briefly reloads this page, because the only way to write IE
              mode&rsquo;s cookies is to visit it. Reload any CMS tab afterwards to
              pick the changes up. You can also copy from here at any time — for
              example on a machine where IE mode has never had these settings.
            </p>
            <button
              type="button"
              className="govuk-button govuk-button--secondary"
              data-module="govuk-button"
              disabled={loading}
              onClick={handlePushToCms}
            >
              Copy to IE mode
            </button>
          </fieldset>
        </div>
      </form>

      {/* Always in the DOM, so screen readers announce the bar when it appears. */}
      <div aria-live="polite">
        {ieModeOutOfDate && (
          <div className="ie-mode-bar" role="region" aria-label="Copy settings to IE mode">
            <div className="govuk-width-container">
              <div className="ie-mode-bar__inner">
                <div className="ie-mode-bar__text">
                  <h2 className="govuk-heading-s govuk-!-margin-bottom-1">
                    CMS will not see this change yet
                  </h2>
                  <p className="govuk-body govuk-!-font-size-16">
                    {IE_MODE_LABELS.join(" and ")}{" "}
                    {IE_MODE_LABELS.length === 1 ? "is" : "are"} also read by CMS
                    Classic and CMS Modern, which run in IE mode with their own
                    cookies. Copy your settings across, then reload any CMS tab.
                  </p>
                </div>
                <button
                  type="button"
                  className="govuk-button"
                  data-module="govuk-button"
                  onClick={handlePushToCms}
                >
                  Copy to IE mode
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
