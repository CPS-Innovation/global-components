import { Component, Fragment, h, Host, Prop, Watch } from "@stencil/core";
import { renderError } from "../common/render-error";
import { readyState, mergeTags } from "../../store/store";
import { replaceTagsInString } from "../cps-global-menu/menu-config/helpers/replace-tags-in-string";
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
    const { isReady, state } = readyState(["config", "context", "preview", "flags"], ["caseIdentifiers", "tags"]);

    const { headerCustomCssClasses, headerCustomCssStyles } =
      isReady && state?.context.found ? state.context : { headerCustomCssClasses: undefined, headerCustomCssStyles: undefined };

    const showGovUkRebrand = isReady && FEATURE_FLAGS.shouldShowGovUkRebrand(state);

    const cssClass = `${showGovUkRebrand ? "govuk-template--rebranded" : ""} ${showGovUkRebrand === "cps" ? "cps-theme" : ""}`;

    // The subject is a template over the current tags — a named group in this
    // context's own path regex — resolved the same way msalRedirectUrl and the menu
    // hrefs are. An unresolved template leaves the region case-wide rather than
    // scoped to an empty subject, which would be a section nobody else is in.
    const configured = isReady && state.context.found ? state.context.caseLockingRegion : undefined;
    const subject = configured?.subject ? replaceTagsInString(configured.subject, state.tags ?? {}) : "";
    const regionSubject = subject && !subject.includes("{") ? subject : undefined;
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
              {/* WHAT WE ARE PRESENT IN, from the matched context.
                Every presence variant is identifiable from the address bar, and the
                context tree already matches addresses — so the section comes from
                config (caseLockingRegion) rather than from anything a host app has
                to place in its DOM. A path that captures which witness is being
                edited has said everything presence needs.
                NO FALLBACK: a context that names no region registers nothing. That
                makes "no presence on this page" something config can say, which a
                default could not distinguish from "the case as a whole" — and it
                stops presence being a side effect of whether a caseId happened to
                reach the store from a path group or from a handover. */}
            {configured && state.caseIdentifiers?.caseId && <cps-region code={configured.code} subject={regionSubject}></cps-region>}
            </Fragment>
          )}
        </div>
      </Host>
    );
  }
}
