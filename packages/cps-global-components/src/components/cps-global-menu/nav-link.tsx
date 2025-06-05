import { Component, Prop, h, Event, EventEmitter } from "@stencil/core";
import * as core from "cps-global-core";

window.addEventListener(core.GLOBAL_EVENT_NAME, (event: Event & { detail: string }) => console.debug("A navigation event has been fired: ", event));

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

  @Event({
    eventName: "cps-global-header-event",
    composed: true,
    cancelable: true,
    bubbles: true,
  })
  CpsGlobalHeaderEvent: EventEmitter<string>;

  emitEvent = (link: string) => this.CpsGlobalHeaderEvent.emit(link);

  launchNewTab = (link: string) => window.open(link, "_blank", "noopener,noreferrer");

  render() {
    const mode: LinkMode = this.disabled || !this.href ? "disabled" : this.openInNewTab ? "new-tab" /*: isOutSystems ? "emit-event"*/ : "standard";

    const renderLink = () => {
      switch (mode) {
        case "disabled":
          return (
            <a class="govuk-link disabled" role="link" aria-disabled={true} href={this.href}>
              {this.label}
            </a>
          );
        case "new-tab":
          return (
            <button class="linkButton" role="link" onClick={() => this.launchNewTab(this.href)}>
              {this.label}
            </button>
          );
        // case "emit-event":
        //   return (
        //     <button class="linkButton" role="link" onClick={() => this.emitEvent(this.href)}>
        //       {this.label}
        //     </button>
        //   );
        default:
          return (
            <a class="govuk-link" role="link" href={this.href}>
              {this.label}
            </a>
          );
      }
    };

    return (
      <li class={this.selected ? "selected" : ""} aria-current={this.ariaSelected ? "page" : undefined}>
        {renderLink()}
      </li>
    );
  }
}
