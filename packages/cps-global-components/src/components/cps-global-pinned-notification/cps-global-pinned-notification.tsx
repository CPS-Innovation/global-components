import { Component, h, Prop, State, Element, Event, EventEmitter } from "@stencil/core";

/**
 * The pinned notification from the UCD prototype's app-notification-banner-pinned.
 *
 * WHY THIS IS NOT A FLAG ON cps-gds-notification-banner
 * It began as one, and the specialisation outgrew it. This component positions
 * itself against the viewport, mutates the host page's layout, owns a
 * progressive-enhancement toggle and answers to UCD; the GDS banner is a thin
 * shell over a govuk-frontend component and answers to govuk-frontend. Sharing
 * one component meant every notification in the app rendered through code that
 * only the pinned one used — including host-DOM teardown it never performed.
 *
 * The prototype makes the same split: app-notification-banner-pinned is a
 * wrapper with its own JS module around a stock govuk-notification-banner.
 *
 * WHY NOT COMPOSE the GDS banner inside this one, which would avoid repeating
 * its markup: the toggle has to sit INSIDE the banner's header, next to the
 * title. The prototype achieves that by reaching in with jQuery
 * (header.append(toggle)). Doing the equivalent across a component boundary is
 * worse than repeating twenty lines of markup that govuk-frontend has not
 * changed in years.
 */
@Component({
  tag: "cps-global-pinned-notification",
  styleUrl: "cps-global-pinned-notification.scss",
  shadow: false,
})
export class CpsGlobalPinnedNotification {
  @Element() el: HTMLElement;

  /** The title text shown in the banner header. */
  @Prop() titleText?: string;

  /** The heading level for the title (1-6). Defaults to 2. */
  @Prop() titleHeadingLevel: number = 2;

  /** Renders the dismiss button. Persistence is the caller's responsibility via the `cpsDismissed` event. */
  @Prop() dismissible: boolean = false;

  /**
   * Show only the header until the user asks for detail — the prototype's
   * progressive enhancement, reimplemented rather than bolted on with jQuery.
   * The toggle carries aria-expanded and aria-controls, and the content is
   * genuinely `hidden` when collapsed, so assistive tech is told the same story
   * the sighted user gets rather than reading content that looks closed.
   */
  @Prop() collapsible: boolean = false;

  @State() expanded: boolean = false;

  /** Fired when the user clicks the dismiss button. */
  @Event() cpsDismissed: EventEmitter<void>;

  private previousBodyPaddingBottom: string | null = null;
  private bannerObserver?: ResizeObserver;

  // Unique per instance so aria-labelledby and aria-controls always resolve to
  // THIS banner's own elements. An id fixed at the class level resolves to
  // whichever instance renders first, which is the bug this component's
  // predecessor shipped with.
  private static idCount = 0;
  private instance = (CpsGlobalPinnedNotification.idCount += 1);
  private titleId = `cps-pinned-notification-title-${this.instance}`;
  private contentId = `cps-pinned-notification-content-${this.instance}`;

  componentDidRender() {
    this.applyFooterClearance();
  }

  disconnectedCallback() {
    this.releaseFooterClearance();
  }

  private toggle = () => {
    this.expanded = !this.expanded;
  };

  private dismiss = () => {
    this.cpsDismissed.emit();
  };

  /**
   * MAKE ROOM BELOW THE FOOTER.
   *
   * A banner fixed to the bottom of the viewport covers whatever is behind it,
   * and at the very end of the page that is the footer — permanently, since you
   * cannot scroll past it. The design asks for the opposite: pinned while you
   * read, but out of the footer's way once you reach the bottom.
   *
   * Adding the banner's own height as padding to the bottom of the page gives
   * the document somewhere further to scroll. At full scroll that padding is the
   * strip the banner occupies, so the footer comes to rest directly above it and
   * the banner reads as sitting below the footer. No collision detection, no
   * measuring the footer, nothing to keep in sync while scrolling.
   *
   * ASSUMES THE DOCUMENT IS WHAT SCROLLS. A host app that scrolls an inner
   * container instead gains no room from this, and the banner will still sit
   * over its footer.
   *
   * WE MUTATE HOST DOM HERE. Confined to body's inline padding-bottom, with the
   * previous inline value captured so release restores exactly what was there —
   * including "not set at all" — and released on disconnect. Height is observed
   * rather than measured once, because the banner is collapsible and changes
   * height when the user expands it.
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

  render() {
    const HeadingTag = `h${this.titleHeadingLevel}` as any;
    const collapsed = this.collapsible && !this.expanded;

    // The wrapper carries the positioning; the inner banner is stock GDS. That
    // separation is load-bearing: govuk-frontend gives .govuk-notification-banner
    // a 60px bottom margin at tablet and up, and the CSS can only reset it from
    // outside. With the pinned class on the banner itself that margin holds the
    // whole thing clear of the viewport floor.
    const wrapperClasses = [
      "app-notification-banner-pinned",
      this.collapsible && "app-notification-banner-pinned--initialised",
      this.collapsible && this.expanded && "app-notification-banner-pinned--expanded",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div class={wrapperClasses} data-module="app-notification-banner-pinned">
        <div class="govuk-notification-banner" role="region" aria-labelledby={this.titleId} data-module="govuk-notification-banner">
          <div class="govuk-notification-banner__header">
            <HeadingTag class="govuk-notification-banner__title" id={this.titleId}>
              {this.titleText}
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
      </div>
    );
  }
}
