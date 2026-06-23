import { Component, Prop, h, Event, EventEmitter } from "@stencil/core";
import { WithLogging } from "../../logging/WithLogging";
import { ContextsToUseEventNavigation } from "cps-global-configuration";
import { newTab, navigateToHref, updateAddressQuery, isSamePageAsCurrent } from "../../services/browser/navigation/navigation";

type LinkMode = "standard" | "new-tab" | "emit-event" | "emit-event-private" | "disabled";

@Component({
  tag: "nav-link",
  shadow: false,
})
export class NavLink {
  @Prop() label: string;
  @Prop() href: string;
  @Prop() selected: boolean;
  @Prop() ariaSelected?: boolean;
  @Prop() disabled: boolean;
  @Prop() openInNewTab?: boolean;
  @Prop() dcfContextsToUseEventNavigation?: ContextsToUseEventNavigation;

  @Event({
    eventName: "cps-global-header-event",
    composed: true,
    cancelable: true,
    bubbles: true,
  })
  CpsGlobalHeaderEvent: EventEmitter<string>;

  handleOsNavigation = () => {
    const { data, paramsToAddToQuery } = this.dcfContextsToUseEventNavigation || {};
    this.CpsGlobalHeaderEvent.emit(data);
    // If the destination href is the page we're already on, just mutate query state
    //  (preserves unrelated params, supports null-to-delete). Otherwise the destination
    //  is a different page entirely — do a full navigation.
    if (isSamePageAsCurrent(this.href)) {
      if (paramsToAddToQuery) {
        updateAddressQuery(paramsToAddToQuery, true);
      }
    } else {
      navigateToHref(this.href);
    }
  };

  launchNewTab = () => newTab(this.href);

  @WithLogging("NavLink")
  render() {
    const mode: LinkMode = this.disabled || !this.href ? "disabled" : this.openInNewTab ? "new-tab" : this.dcfContextsToUseEventNavigation ? "emit-event" : "standard";

    const coreProps = {
      "role": "link",
      "aria-current": this.ariaSelected ? "true" : this.selected ? "page" : undefined,
    };
    const renderLink = () => {
      switch (mode) {
        case "disabled":
          return (
            <a {...coreProps} class="govuk-link disabled" aria-disabled={true} href={this.href}>
              {this.label}
            </a>
          );
        case "new-tab":
          return (
            <button {...coreProps} class="linkButton" aria-label={`${this.label} (opens in new tab)`} onClick={() => this.launchNewTab()}>
              {this.label}
            </button>
          );
        case "emit-event":
          return (
            <button {...coreProps} class="linkButton" onClick={() => this.handleOsNavigation()}>
              {this.label}
            </button>
          );
        default:
          return (
            <a {...coreProps} class="govuk-link" href={this.href}>
              {this.label}
            </a>
          );
      }
    };

    return <li class={this.selected ? "selected" : ""}>{renderLink()}</li>;
  }
}
