import { Component, h, Prop, State, Element, Event, EventEmitter } from "@stencil/core";

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

  /** Renders the dismiss button. Persistence is the caller's responsibility via the `cpsDismissed` event. */
  @Prop() dismissible: boolean = false;

  /**
   * Pin the banner to the bottom of the viewport instead of letting it sit in
   * the document flow. Matches the UCD prototype's app-notification-banner-pinned.
   */
  @Prop() pinned: boolean = false;

  /**
   * Show only the header until the user asks for detail — the prototype's
   * progressive enhancement, reimplemented rather than bolted on with jQuery.
   * The toggle carries aria-expanded and aria-controls, and the content is
   * genuinely `hidden` when collapsed, so assistive tech is told the same story
   * the sighted user gets rather than reading content that looks closed.
   */
  @Prop() collapsible: boolean = false;

  @State() expanded: boolean = false;

  private previousBodyPaddingBottom: string | null = null;
  private bannerObserver?: ResizeObserver;

  /** Fired when the user clicks the dismiss button. */
  @Event() cpsDismissed: EventEmitter<void>;

  componentDidLoad() {
    if (this.isSuccess && !this.disableAutoFocus) {
      const banner = this.el.querySelector<HTMLElement>(".govuk-notification-banner");
      banner?.focus();
    }
  }

  componentDidRender() {
    if (this.pinned) {
      this.applyFooterClearance();
    } else {
      this.releaseFooterClearance();
    }
  }

  disconnectedCallback() {
    this.releaseFooterClearance();
  }

  /**
   * MAKE ROOM BELOW THE FOOTER.
   *
   * A banner fixed to the bottom of the viewport covers whatever is behind it,
   * and at the very end of the page that is the footer — permanently, since you
   * cannot scroll past it. The design asks for the opposite: pinned while you
   * read, but out of the footer's way once you reach the bottom.
   *
   * Adding the banner's own height as padding to the bottom of the page gives the
   * document somewhere further to scroll. At full scroll that padding is the
   * strip the banner occupies, so the footer comes to rest directly above it and
   * the banner reads as sitting below the footer. No collision detection, no
   * measuring the footer, nothing to keep in sync while scrolling.
   *
   * WE MUTATE HOST DOM HERE. Confined to body's inline padding-bottom, with the
   * previous inline value captured so release restores exactly what was there —
   * including "not set at all" — and released on disconnect as well as on
   * unpinning. Height is observed rather than measured once, because the banner
   * is collapsible and changes height when the user expands it.
   */
  private applyFooterClearance() {
    const banner = this.el.querySelector<HTMLElement>(".app-notification-banner-pinned");
    if (!banner) {
      return;
    }
    if (this.previousBodyPaddingBottom === null) {
      this.previousBodyPaddingBottom = document.body.style.paddingBottom;
    }
    const height = `${Math.ceil(banner.getBoundingClientRect().height)}px`;
    // Only write on an actual change: the observer below watches an element whose
    // size this padding can influence via reflow, and an unconditional write is
    // how that becomes a ResizeObserver loop.
    if (document.body.style.paddingBottom !== height) {
      document.body.style.paddingBottom = height;
    }
    if (!this.bannerObserver && typeof ResizeObserver !== "undefined") {
      this.bannerObserver = new ResizeObserver(() => this.applyFooterClearance());
      this.bannerObserver.observe(banner);
    }
  }

  private releaseFooterClearance() {
    this.bannerObserver?.disconnect();
    this.bannerObserver = undefined;
    if (this.previousBodyPaddingBottom !== null) {
      document.body.style.paddingBottom = this.previousBodyPaddingBottom;
      this.previousBodyPaddingBottom = null;
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
    this.cpsDismissed.emit();
  };

  // Unique per instance so aria-controls always points at this banner's own
  // content, even with several on a page.
  private contentId = `cps-notification-banner-content-${(CpsGdsNotificationBanner.idCount += 1)}`;

  private static idCount = 0;

  private toggle = () => {
    this.expanded = !this.expanded;
  };

  render() {
    const HeadingTag = `h${this.titleHeadingLevel}` as any;
    const collapsed = this.collapsible && !this.expanded;
    const classes = ["govuk-notification-banner", this.isSuccess && "govuk-notification-banner--success"].filter(Boolean).join(" ");

    // The pinned variant is a WRAPPER around a stock notification banner, not a
    // modifier on it — the prototype's structure, and load-bearing: it is what
    // lets the CSS reset the banner's own 60px bottom margin, which otherwise
    // holds the banner clear of the viewport floor.
    const pinnedClasses = [
      "app-notification-banner-pinned",
      this.collapsible && "app-notification-banner-pinned--initialised",
      this.collapsible && this.expanded && "app-notification-banner-pinned--expanded",
    ]
      .filter(Boolean)
      .join(" ");

    const banner = (
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
          {this.collapsible && (
            <button
              type="button"
              class="app-notification-banner-pinned__toggle"
              aria-expanded={this.expanded ? "true" : "false"}
              aria-controls={this.contentId}
              onClick={this.toggle}
            >
              {this.expanded ? "Hide details" : "Show details"}
            </button>
          )}
        </div>
        <div class="govuk-notification-banner__content" id={this.contentId} hidden={collapsed}>
          <slot />
          {this.dismissible && (
            <button class="govuk-button govuk-button--secondary" onClick={this.dismiss}>
              Dismiss permanently
            </button>
          )}
        </div>
      </div>
    );

    return this.pinned ? (
      <div class={pinnedClasses} data-module="app-notification-banner-pinned">
        {banner}
      </div>
    ) : (
      banner
    );
  }
}
