import { Component, Element, h, Listen, Prop, State } from "@stencil/core";
import { WithLogging } from "../../logging/WithLogging";
import { dispatchCmsNavigate, dispatchModernCmsNavigate } from "../../services/navigate-cms/initialise-navigate-cms";

type Option = { key: string; label: string; navigate: (caseId: number) => void };

const OPTIONS: Option[] = [
  { key: "classic", label: "CMS Classic", navigate: dispatchCmsNavigate },
  { key: "modern", label: "CMS Modern", navigate: dispatchModernCmsNavigate },
];

/**
 * "Open in…" dropdown offering CMS Classic and CMS Modern. The look follows the UCD
 * prototype's CMS Classic dropdown; the behaviour does not, because the prototype's
 * is mouse-only.
 *
 * WHY A DISCLOSURE, NOT role="menu": the ARIA menu pattern promises application-style
 * keyboard handling (roving focus, typeahead) and takes the options out of the Tab
 * order. A disclosure button that reveals ordinary buttons is what W3C recommends for
 * site navigation, and it works with plain Tab as well as with the arrow keys we add.
 *
 * Closed means `hidden`, so assistive tech and the Tab order see what the eye sees.
 */
@Component({
  tag: "cps-global-open-in-cms",
  styleUrl: "cps-global-open-in-cms.scss",
  shadow: false,
})
export class CpsGlobalOpenInCms {
  @Element() el: HTMLElement;

  @Prop() caseId: number;

  @State() open = false;

  // Right-aligned under the trigger by default (it lives at the right of the menu).
  // Flipped to left-aligned only if that would push the panel off the left of the
  // viewport, which is what happens under heavy zoom when the menu wraps.
  @State() alignStart = false;

  private static idCount = 0;
  private panelId = `cps-open-in-cms-panel-${(CpsGlobalOpenInCms.idCount += 1)}`;

  private triggerEl?: HTMLButtonElement;
  private panelEl?: HTMLElement;

  // The menu sits inside cps-global-header's shadow root, so a document listener sees
  // events retargeted to the header host. composedPath() still holds the real target.
  @Listen("click", { target: "document" })
  handleDocumentClick(event: MouseEvent) {
    if (this.open && !event.composedPath().includes(this.el)) {
      this.close(false);
    }
  }

  componentDidRender() {
    if (!this.open || !this.panelEl || this.alignStart) {
      return;
    }
    if (this.panelEl.getBoundingClientRect().left < 0) {
      this.alignStart = true;
    }
  }

  private optionButtons = () => Array.from(this.el.querySelectorAll<HTMLButtonElement>(".open-in-cms-dropdown__option"));

  private close(returnFocus: boolean) {
    this.open = false;
    this.alignStart = false;
    if (returnFocus) {
      this.triggerEl?.focus();
    }
  }

  private toggle = () => {
    if (this.open) {
      this.close(false);
    } else {
      this.open = true;
    }
  };

  private select = (option: Option) => {
    this.close(true);
    option.navigate(this.caseId);
  };

  // Move focus among the trigger and the options; Tab works regardless.
  private focusOption = async (which: "first" | "last" | "next" | "previous") => {
    if (!this.open) {
      this.open = true;
      // Options are `hidden` until the next render, and hidden buttons can't take focus
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    const options = this.optionButtons();
    if (!options.length) {
      return;
    }
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const index =
      which === "first"
        ? 0
        : which === "last"
          ? options.length - 1
          : which === "next"
            ? (current + 1) % options.length
            : (current - 1 + options.length) % options.length;
    options[index].focus();
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    const fromTrigger = event.target === this.triggerEl;
    switch (event.key) {
      case "Escape":
        if (this.open) {
          event.preventDefault();
          this.close(true);
        }
        return;
      case "ArrowDown":
        event.preventDefault();
        this.focusOption(fromTrigger ? "first" : "next");
        return;
      case "ArrowUp":
        event.preventDefault();
        this.focusOption(fromTrigger ? "last" : "previous");
        return;
      case "Home":
        if (!fromTrigger) {
          event.preventDefault();
          this.focusOption("first");
        }
        return;
      case "End":
        if (!fromTrigger) {
          event.preventDefault();
          this.focusOption("last");
        }
        return;
    }
  };

  // Tabbing (or anything else) out of the component closes it, so an open panel is
  // never left floating over the page after the user has moved on.
  private handleFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (this.open && next && !this.el.contains(next)) {
      this.close(false);
    }
  };

  @WithLogging("CpsGlobalOpenInCms")
  render() {
    return (
      // An <li>, because this element sits directly in the sub-menu's <ul>: without one
      // the dropdown is not one of the list's items to a screen reader (nav-link does the same)
      <li class="open-in-cms-dropdown" onKeyDown={this.handleKeyDown} onFocusout={this.handleFocusOut}>
        <button
          type="button"
          class="linkButton open-in-cms-dropdown__trigger"
          aria-expanded={this.open ? "true" : "false"}
          aria-controls={this.panelId}
          onClick={this.toggle}
          ref={el => (this.triggerEl = el)}
        >
          Open in…
          <svg class="open-in-cms-dropdown__chevron" viewBox="0 0 12 8" aria-hidden="true" focusable="false">
            <path d="M0 0h12L6 8z" fill="currentColor" />
          </svg>
        </button>
        <div
          id={this.panelId}
          class={{ "open-in-cms-dropdown__panel": true, "open-in-cms-dropdown__panel--align-start": this.alignStart }}
          hidden={!this.open}
          ref={el => (this.panelEl = el)}
        >
          {OPTIONS.map(option => (
            <button type="button" class="open-in-cms-dropdown__option" data-option={option.key} onClick={() => this.select(option)}>
              {/* Spoken as "Open in CMS Classic", so the option makes sense out of context
                  (a screen reader's list of buttons). The visible label is still in the
                  name, so voice control's "click CMS Classic" works. */}
              <span class="govuk-visually-hidden">Open in </span>
              {option.label}
            </button>
          ))}
        </div>
      </li>
    );
  }
}
