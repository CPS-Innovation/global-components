import { Component, Fragment, h, Host, Prop, Watch } from "@stencil/core";
import { renderError } from "../common/render-error";
import { readyState, mergeTags } from "../../store/store";
import { WithLogging } from "../../logging/WithLogging";
import { makeConsole } from "../../logging/makeConsole";
import { FEATURE_FLAGS } from "cps-global-configuration";

const { _debug } = makeConsole("CpsGlobalHeader");

@Component({
  tag: "cps-global-header",
  shadow: true, // must be true as this is our published entry point!
  styleUrl: "cps-global-header.scss",
})
export class CpsGlobalHeader {
  @Prop() isDcf: boolean = false;

  /**
   * Render the CHROME ONLY — the banner and the menu — and none of the components
   * that do things.
   *
   * This exists for one caller: cps-global-case-locking-interstitial renders a header
   * inside its dialog so the interruption looks like a page rather than a card on
   * a blank screen. Reusing this component rather than reassembling its parts
   * keeps the theme classes, the custom host CSS, the error fallback and the
   * ordering in ONE place — hand-copying them would drift the moment any of them
   * changed. Without this flag it would also recurse, since the block below
   * renders the overlay itself.
   *
   * The gate wraps the behavioural children as a GROUP rather than listing
   * exclusions, so anything added there later is covered by default.
   */
  @Prop() chromeOnly: boolean = false;
  @Watch("isDcf")
  onIsDcfChange(newValue: boolean) {
    _debug({ newValue });
    mergeTags({ propTags: { isDcf: String(newValue) } });
  }

  componentWillLoad() {
    // Manually call the handler for initial setup
    this.onIsDcfChange(this.isDcf);
  }

  @WithLogging("CpsGlobalHeader")
  render() {
    // caseIdentifiers is OPTIONAL, not required: it is legitimately absent on every
    // page that is not a case, and gating the header's readiness on it would stop
    // the header rendering at all there.
    const { isReady, state } = readyState(["config", "context", "preview", "flags"], ["caseIdentifiers"]);

    const { headerCustomCssClasses, headerCustomCssStyles } =
      isReady && state?.context.found ? state.context : { headerCustomCssClasses: undefined, headerCustomCssStyles: undefined };

    const showGovUkRebrand = isReady && FEATURE_FLAGS.shouldShowGovUkRebrand(state);

    const cssClass = `${showGovUkRebrand ? "govuk-template--rebranded" : ""} ${showGovUkRebrand === "cps" ? "cps-theme" : ""}`;
    return (
      <Host class={headerCustomCssClasses} style={headerCustomCssStyles}>
        <div data-internal-root data-initialisation-status={state.initialisationStatus} class={cssClass}>
          <cps-global-banner></cps-global-banner>
          {state.fatalInitialisationError ? renderError(state.fatalInitialisationError) : <cps-global-menu></cps-global-menu>}
          {!this.chromeOnly && (
            <Fragment>
              <cps-global-notifications></cps-global-notifications>
              <cps-global-case-locking-notification></cps-global-case-locking-notification>
              <cps-global-case-locking-interstitial></cps-global-case-locking-interstitial>
              {state.caseIdentifiers?.caseId && <cps-region code="case"></cps-region>}
            </Fragment>
          )}
        </div>
      </Host>
    );
  }
}
