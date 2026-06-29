import { Component, h, Prop } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "cps-global-configuration";

// Shadow-DOM partner to the light-DOM cps-global-footer wrapper. The wrapper owns
// the skip-target id, focusability, and the contentinfo landmark; this component
// owns the rendered markup and the style encapsulation (host apps in the wild
// have unpredictable global CSS — we keep the visible footer behind a shadow root
// to be safe).
@Component({
  tag: "cps-global-footer-content",
  styleUrl: "cps-global-footer-content.scss",
  shadow: true,
})
export class CpsGlobalFooterContent {
  // Forwarded from the wrapper. Some host apps render the signed-in user's
  // email in their native footer; the subscriber scrapes it across.
  @Prop() userEmail?: string;

  render() {
    const { isReady, state } = readyState("config", "preview");
    const showGovUkRebrand = isReady && FEATURE_FLAGS.shouldShowGovUkRebrand(state);
    const accessibilityStatement = isReady ? FEATURE_FLAGS.accessibilityStatementLink(state) : { showLink: false, url: undefined };
    const cssClass = `${showGovUkRebrand ? "govuk-template--rebranded" : ""} ${showGovUkRebrand === "cps" ? "cps-theme" : ""}`;
    return (
      <div class={cssClass}>
        <footer class="govuk-footer">
          <h2 class="govuk-visually-hidden">Footer links</h2>
          <ul class="govuk-footer__inline-list">
            {accessibilityStatement.showLink && (
              <li class="govuk-footer__inline-list-item">
                <a class="govuk-footer__link" href={accessibilityStatement.url} target="_blank" rel="noopener noreferrer">
                  Accessibility statement (opens in new tab)
                </a>
              </li>
            )}
          </ul>
          {this.userEmail && (
            <span class="govuk-visually-hidden" data-user-email aria-hidden="true">
              {this.userEmail}
            </span>
          )}
        </footer>
      </div>
    );
  }
}
