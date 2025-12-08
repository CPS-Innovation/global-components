import { Component, Prop, h, Event, EventEmitter } from "@stencil/core";
import { makeConsole } from "../../logging/makeConsole";
import { WithLogging } from "../../logging/WithLogging";

const { _debug } = makeConsole("NavLink");

window.addEventListener("cps-global-header-event", (event: Event & { detail: string }) => _debug("A navigation event has been fired: ", event));

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
  @Prop() preferEventNavigation?: "public" | "private" | false | undefined;

  @Event({
    eventName: "cps-global-header-event",
    composed: true,
    cancelable: true,
    bubbles: true,
  })
  CpsGlobalHeaderEvent: EventEmitter<string>;

  emitEvent = (link: string) => this.CpsGlobalHeaderEvent.emit(link);

  @Event({
    eventName: "cps-global-header-event-private",
    composed: true,
    cancelable: true,
    bubbles: true,
  })
  CpsGlobalHeaderEventPrivate: EventEmitter<string>;

  emitEventPrivate = (link: string) => this.CpsGlobalHeaderEventPrivate.emit(link);

  launchNewTab = (link: string) => window.open(link, "_blank", "noopener,noreferrer");

  @WithLogging("NavLink")
  render() {
    const mode: LinkMode =
      this.disabled || !this.href
        ? "disabled"
        : this.openInNewTab
        ? "new-tab"
        : this.preferEventNavigation === "public"
        ? "emit-event"
        : this.preferEventNavigation === "private"
        ? "emit-event-private"
        : "standard";

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
        case "emit-event-private":
          return (
            <button {...coreProps} class="linkButton" onClick={() => this.emitEventPrivate(this.href)}>
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
