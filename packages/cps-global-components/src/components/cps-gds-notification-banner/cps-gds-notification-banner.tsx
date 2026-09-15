import { Component, h, Prop, Element, Event, EventEmitter } from "@stencil/core";

export type NotificationBannerType = "success";

/**
 * A thin shell over govuk-frontend's notification banner.
 *
 * Deliberately thin. The pinned variant that used to live here as a flag is now
 * cps-global-pinned-notification: it positions against the viewport, mutates the
 * host page's layout and follows UCD's design, none of which belongs in the
 * component every notification in the app renders through.
 */
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

  /**
   * Custom id for the title element. Defaults to one generated per instance.
   *
   * NOT A FIXED STRING, which is what GDS's own example markup uses and what this
   * defaulted to. aria-labelledby is an IDREF and resolves to the FIRST matching
   * element in the tree, so several banners sharing an id all end up named by
   * whichever renders first — and cps-global-notifications renders one banner per
   * notification, all as siblings. The symptom is a screen reader announcing the
   * same region name several times over, on the busiest screens.
   */
  @Prop() titleId?: string;

  /** The heading level for the title (1-6). Defaults to 2. */
  @Prop() titleHeadingLevel: number = 2;

  /** Override the ARIA role. Defaults to "region" (or "alert" for success type). */
  @Prop() role?: string;

  /** Prevent the banner from being focused on page load (only relevant for success type). */
  @Prop() disableAutoFocus: boolean = false;

  /** Renders the dismiss button. Persistence is the caller's responsibility via the `cpsDismissed` event. */
  @Prop() dismissible: boolean = false;

  /** Fired when the user clicks the dismiss button. */
  @Event() cpsDismissed: EventEmitter<void>;

  private static idCount = 0;
  private generatedTitleId = `cps-notification-banner-title-${(CpsGdsNotificationBanner.idCount += 1)}`;

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

  private get resolvedTitleId() {
    return this.titleId ?? this.generatedTitleId;
  }

  private dismiss = () => {
    this.cpsDismissed.emit();
  };

  render() {
    const HeadingTag = `h${this.titleHeadingLevel}` as any;
    const titleId = this.resolvedTitleId;
    const classes = ["govuk-notification-banner", this.isSuccess && "govuk-notification-banner--success"].filter(Boolean).join(" ");

    return (
      <div
        class={classes}
        role={this.resolvedRole}
        aria-labelledby={titleId}
        data-module="govuk-notification-banner"
        tabindex={this.isSuccess && !this.disableAutoFocus ? -1 : undefined}
      >
        <div class="govuk-notification-banner__header">
          <HeadingTag class="govuk-notification-banner__title" id={titleId}>
            {this.resolvedTitleText}
          </HeadingTag>
        </div>
        <div class="govuk-notification-banner__content">
          <slot />
          {this.dismissible && (
            <button class="govuk-button govuk-button--secondary" onClick={this.dismiss}>
              Dismiss permanently
            </button>
          )}
        </div>
      </div>
    );
  }
}
