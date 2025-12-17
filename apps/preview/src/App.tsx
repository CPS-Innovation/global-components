import { useState, useEffect, useCallback } from 'react';

interface PreviewState {
  enabled: boolean;
  features: string[];
}

const STATE_ENDPOINT = '/global-components/state/preview';

const FEATURES = [
  { id: 'case-markers', label: 'Case details' },
  { id: 'case-search', label: 'Case search' },
  { id: 'my-recent-cases', label: 'My recent cases' },
  { id: 'new-header', label: 'New header' },
  { id: 'accessibility', label: 'Accessibility' },
] as const;

type StatusType = 'info' | 'error' | 'success';

export function App() {
  const [enabled, setEnabled] = useState(false);
  const [features, setFeatures] = useState<string[]>([]);
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
      const state: PreviewState | null = await response.json();
      if (state) {
        setEnabled(state.enabled);
        setFeatures(state.features);
      }
    } catch (err) {
      showStatus(`Failed to load settings: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showStatus]);

  const saveState = useCallback(async (newEnabled: boolean, newFeatures: string[]) => {
    try {
      const response = await fetch(STATE_ENDPOINT, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled, features: newFeatures }),
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
    setEnabled(checked);
    saveState(checked, features);
  };

  const handleFeatureChange = (featureId: string, checked: boolean) => {
    const newFeatures = checked
      ? [...features, featureId]
      : features.filter(f => f !== featureId);
    setFeatures(newFeatures);
    saveState(enabled, newFeatures);
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
                  checked={enabled}
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
              {FEATURES.map(({ id, label }) => (
                <div key={id} className="govuk-checkboxes__item">
                  <input
                    className="govuk-checkboxes__input"
                    id={id}
                    name="features"
                    type="checkbox"
                    value={id}
                    checked={features.includes(id)}
                    disabled={loading}
                    onChange={(e) => handleFeatureChange(id, e.target.checked)}
                  />
                  <label className="govuk-label govuk-checkboxes__label" htmlFor={id}>
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
