import { Component, Prop, h, Event, EventEmitter } from "@stencil/core";
import { _console } from "../../logging/_console";
import { WithLogging } from "../../logging/WithLogging";

window.addEventListener("cps-global-header-event", (event: Event & { detail: string }) => _console.debug("A navigation event has been fired: ", event));

type LinkMode = "standard" | "new-tab" | "emit-event" | "disabled";

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
  @Prop() preferEventNavigation?: boolean;

  @Event({
    eventName: "cps-global-header-event",
    composed: true,
    cancelable: true,
    bubbles: true,
  })
  CpsGlobalHeaderEvent: EventEmitter<string>;

  emitEvent = (link: string) => this.CpsGlobalHeaderEvent.emit(link);

  launchNewTab = (link: string) => window.open(link, "_blank", "noopener,noreferrer");

  @WithLogging
  render() {
    const mode: LinkMode = this.disabled || !this.href ? "disabled" : this.openInNewTab ? "new-tab" : this.preferEventNavigation ? "emit-event" : "standard";

    const coreProps = {
      "role": "link",
      "aria-current": this.ariaSelected ? "page" : undefined,
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
            <button {...coreProps} class="linkButton" onClick={() => this.launchNewTab(this.href)}>
              {this.label}
            </button>
          );
        case "emit-event":
          return (
            <button {...coreProps} class="linkButton" onClick={() => this.emitEvent(this.href)}>
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
