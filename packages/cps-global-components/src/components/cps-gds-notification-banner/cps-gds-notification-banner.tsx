import { Component, h, Prop, State, Element } from "@stencil/core";

export type NotificationBannerType = "success";

@Component({
  tag: "cps-gds-notification-banner",
  styleUrl: "cps-gds-notification-banner.scss",
  shadow: false,
})
export class CpsGdsNotificationBanner {
  @Element() el: HTMLElement;

  /** Set to "success" for the green success variant. Omit for the default (information) variant. */
  @Prop() type?: NotificationBannerType;

  /** The title text shown in the banner header. Defaults to "Important" or "Success" based on type. */
  @Prop() titleText?: string;

  /** Custom id for the title element. Defaults to "govuk-notification-banner-title". */
  @Prop() titleId: string = "govuk-notification-banner-title";

  /** The heading level for the title (1-6). Defaults to 2. */
  @Prop() titleHeadingLevel: number = 2;

  /** Override the ARIA role. Defaults to "region" (or "alert" for success type). */
  @Prop() role?: string;

  /** Prevent the banner from being focused on page load (only relevant for success type). */
  @Prop() disableAutoFocus: boolean = false;

  /** When set, enables dismiss behaviour. The full localStorage key is `cps-global-notification-dismiss-${dismissKey}`. */
  @Prop() dismissKey?: string;

  @State() dismissed: boolean = false;

  private get storageKey() {
    return `cps-global-components-notification-dismiss-${this.dismissKey}`;
  }

  componentWillLoad() {
    if (this.dismissKey && localStorage.getItem(this.storageKey)) {
      this.dismissed = true;
    }
  }

  componentDidLoad() {
    if (this.isSuccess && !this.disableAutoFocus) {
      const banner = this.el.querySelector<HTMLElement>(".govuk-notification-banner");
      banner?.focus();
    }
  }

  private get isSuccess() {
    return this.type === "success";
  }

  private get resolvedTitleText() {
    return this.titleText ?? (this.isSuccess ? "Success" : "Important");
  }

  private get resolvedRole() {
    return this.role ?? (this.isSuccess ? "alert" : "region");
  }

  private dismiss = () => {
    localStorage.setItem(this.storageKey, "dismissed");
    this.dismissed = true;
  };

  render() {
    if (this.dismissed) {
      return null;
    }

    const HeadingTag = `h${this.titleHeadingLevel}` as any;
    const classes = ["govuk-notification-banner", this.isSuccess && "govuk-notification-banner--success"].filter(Boolean).join(" ");

    return (
      <div
        class={classes}
        role={this.resolvedRole}
        aria-labelledby={this.titleId}
        data-module="govuk-notification-banner"
        tabindex={this.isSuccess && !this.disableAutoFocus ? -1 : undefined}
      >
        <div class="govuk-notification-banner__header">
          <HeadingTag class="govuk-notification-banner__title" id={this.titleId}>
            {this.resolvedTitleText}
          </HeadingTag>
        </div>
        <div class="govuk-notification-banner__content">
          <slot />
          {this.dismissKey && (
            <button class="govuk-button govuk-button--secondary" onClick={this.dismiss}>
              Dismiss permanently
            </button>
          )}
        </div>
      </div>
    );
  }
}
