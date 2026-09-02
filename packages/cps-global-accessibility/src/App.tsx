// Accessibility Preview page.
//
// This page used to own the "Low contrast background" radios (the
// `accessibilityBackground` setting). They now live on the Settings page
// (SettingsApp.tsx), which puts them through the GOV.UK
// form -> check your answers -> confirmation flow. If stakeholders want them
// back here, the control is lifted straight out of TONE_OPTIONS / the fieldset
// in SettingsApp — note that this page saved on every radio change and then
// reloaded, whereas the Settings page batches the save behind the confirmation.
//
// The Edge experimental dark mode guidance has moved to the Settings page too,
// as a collapsed details section. What remains here is the Dark Reader route,
// which needs an extension install rather than a flag flip.
export function App() {
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
      `}</style>

      <h1 className="govuk-heading-l">Accessibility Preview</h1>

      <p className="govuk-body">
        These options help make the CPS services easier to use for extended periods. Choose the ones that work best for
        you.
      </p>

      <p className="govuk-body">
        To soften the bright white page background, or to turn on Microsoft Edge's built-in dark mode, see the{" "}
        <a href="settings.html" className="govuk-link">
          settings page
        </a>
        . For a dark theme that follows you across other websites too, the Dark Reader extension is described below.
      </p>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

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
    </div>
  );
}
