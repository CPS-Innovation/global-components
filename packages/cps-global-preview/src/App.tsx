import { useState, useEffect, useCallback } from 'react';
import type { PreviewState } from 'cps-global-configuration';

const STATE_ENDPOINT = '/global-components/state/preview';

const FEATURES = [
  { key: 'caseMarkers', label: 'Case details' },
  { key: 'caseSearch', label: 'Case search' },
  { key: 'myRecentCases', label: 'My recent cases' },
  { key: 'newHeader', label: 'New header' },
  { key: 'accessibility', label: 'Accessibility' },
] as const;

type FeatureKey = typeof FEATURES[number]['key'];

type StatusType = 'info' | 'error' | 'success';

export function App() {
  const [state, setState] = useState<PreviewState>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ message: string; type: StatusType } | null>(null);

  const showStatus = useCallback((message: string, type: StatusType) => {
    setStatus({ message, type });
    if (type !== 'error') {
      setTimeout(() => setStatus(null), 3000);
    }
  }, []);

  const loadState = useCallback(async () => {
    try {
      const response = await fetch(STATE_ENDPOINT, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to load state');
      }
      const data: PreviewState | null = await response.json();
      if (data) {
        setState(data);
      }
    } catch (err) {
      showStatus(`Failed to load settings: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showStatus]);

  const saveState = useCallback(async (newState: PreviewState) => {
    try {
      const response = await fetch(STATE_ENDPOINT, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newState),
      });
      if (!response.ok) {
        throw new Error('Failed to save state');
      }
      showStatus('Settings saved', 'success');
    } catch (err) {
      showStatus(`Failed to save settings: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    }
  }, [showStatus]);

  useEffect(() => {
    loadState();
  }, [loadState]);

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

  const statusClassName = status
    ? `preview-status preview-status--${status.type}`
    : 'preview-status';

  return (
    <div className="preview-container">
      <style>{`
        .preview-container {
          max-width: 640px;
          margin: 0 auto;
          padding: 20px;
        }
        .preview-status {
          padding: 15px;
          margin-bottom: 20px;
          border-left: 5px solid #1d70b8;
          background-color: #f3f2f1;
        }
        .preview-status--error {
          border-left-color: #d4351c;
        }
        .preview-status--success {
          border-left-color: #00703c;
        }
      `}</style>

      <h1 className="govuk-heading-l">Preview Settings</h1>

      {status && (
        <div className={statusClassName}>
          {status.message}
        </div>
      )}

      <form>
        <div className="govuk-form-group">
          <fieldset className="govuk-fieldset">
            <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
              <h2 className="govuk-fieldset__heading">Preview mode</h2>
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
                <label className="govuk-label govuk-checkboxes__label" htmlFor="enabled">
                  Enable preview
                </label>
              </div>
            </div>
          </fieldset>
        </div>

        <div className="govuk-form-group">
          <fieldset className="govuk-fieldset">
            <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
              <h2 className="govuk-fieldset__heading">Features</h2>
            </legend>
            <div className="govuk-checkboxes" data-module="govuk-checkboxes">
              {FEATURES.map(({ key, label }) => (
                <div key={key} className="govuk-checkboxes__item">
                  <input
                    className="govuk-checkboxes__input"
                    id={key}
                    name="features"
                    type="checkbox"
                    checked={state[key] ?? false}
                    disabled={loading}
                    onChange={(e) => handleFeatureChange(key, e.target.checked)}
                  />
                  <label className="govuk-label govuk-checkboxes__label" htmlFor={key}>
                    {label}
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
        </div>
      </form>
    </div>
  );
}
