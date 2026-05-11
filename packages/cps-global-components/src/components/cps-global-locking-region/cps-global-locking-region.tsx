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
   * enters or leaves "present" state. Reflected so it's readable as an attribute.
   */
  @Prop({ reflect: true }) code!: string;

  /**
   * Tracks whether the registry currently considers this element "present".
   * Presence = mounted in DOM AND not display:none on self or any ancestor.
   */
  private isPresent = false;
  private observer?: ResizeObserver;

  connectedCallback() {
    // Defer to a microtask so a synchronous detach-then-reattach (DOM move)
    // doesn't produce a spurious leave/enter pair.
    queueMicrotask(() => {
      if (!this.el.isConnected) {
        return;
      }
      // Re-attach on every (re)connect so that DOM moves rebind to the new parent.
      this.detachObserver();
      this.attachObserver();
      this.evaluate();
    });
  }

  disconnectedCallback() {
    queueMicrotask(() => {
      if (this.el.isConnected) {
        return;
      }
      this.detachObserver();
      this.applyPresence(false, this.code);
    });
  }

  @Watch('code')
  onCodeChange(newCode: string, oldCode: string) {
    if (newCode === oldCode || !this.isPresent) {
      return;
    }
    regionRegistry.leave(this.el, oldCode);
    regionRegistry.enter(this.el, newCode);
  }

  render() {
    // Host is given a 1×1 inline-block presence so ResizeObserver has dimensions to
    // observe even when no slot content is provided. This lets the component reliably
    // detect ancestor display:none transitions on its own without walking the parent
    // tree. Slot content (when present) grows beyond the minimum naturally.
    return (
      <Host style={{ display: 'inline-block', minWidth: '1px', minHeight: '1px' }}>
        <slot />
      </Host>
    );
  }

  private attachObserver() {
    if (this.observer) {
      return;
    }
    const ctor = (window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (typeof ctor !== 'function') {
      // No RO in this environment — best-effort: assume present while in DOM.
      this.applyPresence(true, this.code);
      return;
    }
    // We observe self because the host's render() applies a 1×1 minimum size
    // ensuring there's always a content box for RO to track. RO reports a 0×0
    // box transition when the element (or any ancestor) becomes display:none.
    this.observer = new ctor(() => this.evaluate());
    this.observer.observe(this.el);
  }

  private detachObserver() {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  private evaluate() {
    // offsetParent is null when the element (or any ancestor) is display:none.
    // Position:fixed also yields null but doesn't apply to us.
    const isLaidOut = this.el.offsetParent !== null;
    this.applyPresence(isLaidOut, this.code);
  }

  private applyPresence(present: boolean, code: string) {
    if (present === this.isPresent) {
      return;
    }
    this.isPresent = present;
    if (present) {
      regionRegistry.enter(this.el, code);
    } else {
      regionRegistry.leave(this.el, code);
    }
  }
}
