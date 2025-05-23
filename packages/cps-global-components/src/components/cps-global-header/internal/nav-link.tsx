import { Component, Prop, h, Event, EventEmitter } from "@stencil/core";
import { OnwardLinkDefinition } from "../../../context/LocationConfig";

window.addEventListener("cps-global-header-event", (event: Event & { detail: string }) => console.debug("A navigation event has been fired: ", event));

type LinkMode = "standard" | "new-tab" | "emit-event" | "disabled";

@Component({
  tag: "nav-link",
  shadow: false,
})
export class NavLink {
  @Prop() label: string;
  @Prop() href: OnwardLinkDefinition;
  @Prop() selected: boolean;
  @Prop() disabled: boolean;
  @Prop() openInNewTab?: boolean;

  @Event({
    eventName: "cps-global-header-event",
    composed: true,
    cancelable: true,
    bubbles: true,
  })
  CpsGlobalHeaderEvent: EventEmitter<string>;

  emitEvent = (link: string) => {
    this.CpsGlobalHeaderEvent.emit(link);
  };

  launchNewTab = (link: string) => {
    window.open(link, "_blank", "noopener,noreferrer");
  };

  async connectedCallback() {}

  async disconnectedCallback() {
    console.log("Disconnected");
  }

  render() {
    let isOutSystems: boolean;
    let link: string;
    if (!this.href) {
    } else if (typeof this.href === "string") {
      link = this.href;
    } else {
      link = this.href.link;
      isOutSystems = true;
    }

    const mode: LinkMode = this.disabled || !this.href ? "disabled" : this.openInNewTab ? "new-tab" : isOutSystems ? "emit-event" : "standard";

    const renderLink = () => {
      switch (mode) {
        case "disabled":
          return (
            <a class="govuk-link disabled" aria-disabled={true} href={link}>
              {this.label}
            </a>
          );
        case "new-tab":
          return (
            <button class="linkButton" onClick={() => this.launchNewTab(link)}>
              {this.label}
            </button>
          );
        case "emit-event":
          return (
            <button class="linkButton" onClick={() => this.emitEvent(link)}>
              {this.label}
            </button>
          );
        default:
          return (
            <a class="govuk-link" href={link}>
              {this.label}
            </a>
          );
      }
    };

    return <li class={this.selected ? "selected" : ""}>{renderLink()}</li>;
  }
}
