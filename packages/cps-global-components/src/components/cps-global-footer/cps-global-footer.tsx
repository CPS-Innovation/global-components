import { Component, h, Prop } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "cps-global-configuration";

@Component({
  tag: "cps-global-footer",
  styleUrl: "cps-global-footer.scss",
  shadow: true,
})
export class CpsGlobalFooter {
  // Some host apps render the signed-in user's email in their native footer.
  // We replace that footer, but e2e tests still expect to find the email in
  // the DOM — so the subscriber that swaps the footer scrapes it across and
  // hands it to us as a prop, which we expose via a visually-hidden node.
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
