import { Component, h, Prop, State, Element, Event, EventEmitter } from "@stencil/core";
import { MIN_REAL_HEADER_WIDTH_PX } from "../../services/browser/dom/footer-subscriber";

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
  private previousFooterBottom: { el: HTMLElement; bottom: string } | null = null;
  private bannerObserver?: ResizeObserver;
  private headerObserver?: ResizeObserver;
  private observedHeader?: HTMLElement | null;

  // Unique per instance so aria-labelledby and aria-controls always resolve to
  // THIS banner's own elements. An id fixed at the class level resolves to
  // whichever instance renders first, which is the bug this component's
  // predecessor shipped with.
  private static idCount = 0;
  private instance = (CpsGlobalPinnedNotification.idCount += 1);
  private titleId = `cps-pinned-notification-title-${this.instance}`;
  private contentId = `cps-pinned-notification-content-${this.instance}`;

  componentDidRender() {
    this.syncWidth();
    this.applyFooterClearance();
  }

  disconnectedCallback() {
    this.releaseFooterClearance();
    this.headerObserver?.disconnect();
    this.headerObserver = undefined;
    this.observedHeader = undefined;
  }

  /**
   * TAKE OUR WIDTH FROM THE HEADER, not from a number of our own.
   *
   * The header and footer are full-bleed inside whatever container the host page
   * puts them in — neither uses govuk-width-container — so the content column is
   * the host's decision, and there is nothing static to match. The prototype's own
   * stylesheet caps this banner at 960px, which is right for the prototype's page
   * and arbitrary anywhere else.
   *
   * cps-global-header is the established source of truth: footer-subscriber
   * already syncs cps-global-footer's width to it, so matching the header here
   * lines all three up by construction rather than by coincidence. The threshold
   * is shared with that subscriber for the same reason it exists there — during a
   * host SPA route change the header is briefly zero-sized, and an unguarded sync
   * writes width:0 and collapses the banner.
   *
   * Auto margins centre it within the fixed left:0/right:0 box, matching what the
   * footer shim does.
   */
  private syncWidth() {
    const banner = this.el.querySelector<HTMLElement>(".app-notification-banner-pinned");
    const header = document.querySelector<HTMLElement>("cps-global-header");
    if (!banner || !header) {
      return;
    }
    // The header is re-created, not just resized, across some SPA navigations.
    if (header !== this.observedHeader) {
      this.headerObserver?.disconnect();
      this.observedHeader = header;
      if (typeof ResizeObserver !== "undefined") {
        this.headerObserver = new ResizeObserver(() => this.syncWidth());
        this.headerObserver.observe(header);
      }
    }
    const rect = header.getBoundingClientRect();
    if (rect.width < MIN_REAL_HEADER_WIDTH_PX) {
      return; // transient mid-navigation value — keep the last good width
    }
    // NOT WHILE WE ARE HIDDEN. The interstitial hides this banner with display:none
    // for the duration of an interruption, and a hidden element measures as all
    // zeros — so the calibration below would read an origin of 0 and write a
    // viewport coordinate into a box that may not be the viewport, putting the
    // banner a scrollbar's width out when it came back. Skip; the observer fires
    // again when display returns.
    const box = banner.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) {
      return;
    }
    // ANCHOR TO THE HEADER'S LEFT EDGE rather than centring in the viewport.
    // Auto margins between left:0 and right:0 centre within the VIEWPORT, but the
    // page's content column is centred within the DOCUMENT — and those differ by
    // the width of the scrollbar, which left the banner about half a scrollbar to
    // the right of the content it belongs to.
    //
    // CALIBRATE RATHER THAN ASSUME THE COORDINATE SPACE. `position: fixed` resolves
    // `left` against the viewport ONLY while no ancestor establishes a containing
    // block; a transform, filter, contain or will-change anywhere above us makes it
    // resolve against that ancestor instead. Both kinds of host are in this estate,
    // and writing a viewport coordinate into the second kind double-counts the
    // ancestor's own offset — which is exactly how fixing the shift on one host
    // introduced it on the other.
    //
    // So park it at left:0, read where that actually landed, and correct by the
    // difference. Two reads and a write, correct in either coordinate space, and it
    // needs to know nothing about the host's CSS.
    banner.style.width = `${rect.width}px`;
    banner.style.right = "auto";
    banner.style.left = "0px";
    const originLeft = banner.getBoundingClientRect().left;
    banner.style.left = `${Math.round(rect.left - originLeft)}px`;
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
    this.raiseFixedFooter(height);
    if (!this.bannerObserver && typeof ResizeObserver !== "undefined") {
      // Width as well as height: this fires when the interstitial gives the banner
      // its display back, which is the moment its position needs recomputing and
      // the only signal we get — restoring an inline style does not re-render us.
      this.bannerObserver = new ResizeObserver(() => {
        this.syncWidth();
        this.applyFooterClearance();
      });
      this.bannerObserver.observe(banner);
    }
  }

  /**
   * A FOOTER THAT IS ITSELF FIXED CANNOT BE CLEARED BY PADDING.
   *
   * The padding above extends the document so the footer comes to rest above the
   * banner at full scroll — which works only while the footer moves with the
   * document. A footer fixed to the viewport stays anchored at bottom: 0, exactly
   * where we are, and we cover it however much room we make after it.
   *
   * WHOSE FOOTER IS FIXED: not the host's. An earlier reading of `position: fixed`
   * on a deployed page was our OWN interstitial's pin, measured while it was up —
   * the host leaves the footer in normal flow, so on an ordinary page it is the
   * padding above that does the work and this is a no-op. This stays because the
   * interstitial does pin the footer, and because a host that fixes its own footer
   * is a real possibility we would otherwise cover.
   *
   * So for that case we move the footer instead, raising it by our own height so
   * the banner occupies its own strip beneath it. Applied only when the footer is
   * genuinely fixed or sticky: on a footer in normal flow `bottom` does nothing,
   * and the padding is what does the work.
   */
  private raiseFixedFooter(height: string) {
    const footer = document.querySelector<HTMLElement>("cps-global-footer");
    if (!footer) {
      return;
    }
    const position = getComputedStyle(footer).position;
    if (position !== "fixed" && position !== "sticky") {
      return;
    }
    if (this.previousFooterBottom === null) {
      this.previousFooterBottom = { el: footer, bottom: footer.style.bottom };
    }
    if (footer.style.bottom !== height) {
      footer.style.bottom = height;
    }
  }

  private lowerFixedFooter() {
    const previous = this.previousFooterBottom;
    this.previousFooterBottom = null;
    if (previous) {
      previous.el.style.bottom = previous.bottom;
    }
  }

  private releaseFooterClearance() {
    this.bannerObserver?.disconnect();
    this.bannerObserver = undefined;
    this.lowerFixedFooter();
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
