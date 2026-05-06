import { Component, Element, Prop, Watch, h, Host } from '@stencil/core';
import { regionRegistry } from './region-registry';

@Component({
  tag: 'cps-region',
  shadow: false, // light DOM so host content renders & styles normally
})
export class CpsRegion {
  @Element() el!: HTMLElement;

  /**
   * Identifier passed to the central service when this region
   * enters or leaves the DOM. Reflected so it's readable as an attribute.
   */
  @Prop({ reflect: true }) code!: string;

  /**
   * Tracks whether the registry currently considers this element "entered".
   * Used to make enter/leave idempotent across DOM moves and code changes.
   */
  private isRegistered = false;

  connectedCallback() {
    // Defer to a microtask so a synchronous detach-then-reattach
    // (DOM move) doesn't produce a spurious leave/enter pair.
    queueMicrotask(() => {
      if (this.el.isConnected && !this.isRegistered) {
        regionRegistry.enter(this.el, this.code);
        this.isRegistered = true;
      }
    });
  }

  disconnectedCallback() {
    queueMicrotask(() => {
      if (!this.el.isConnected && this.isRegistered) {
        regionRegistry.leave(this.el, this.code);
        this.isRegistered = false;
      }
    });
  }

  @Watch('code')
  onCodeChange(newCode: string, oldCode: string) {
    if (newCode === oldCode || !this.isRegistered) return;
    regionRegistry.leave(this.el, oldCode);
    regionRegistry.enter(this.el, newCode);
  }

  render() {
    return (
      <Host>
        <slot />
      </Host>
    );
  }
}
