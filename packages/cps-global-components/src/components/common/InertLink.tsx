import { FunctionalComponent, h } from "@stencil/core";
import { makeConsole } from "../../logging/makeConsole";

const { _debug } = makeConsole("InertLink");

export const InertLink: FunctionalComponent<{ href: string; class?: string }> = (props, children) => {
  const stopAll = (e: Event) => {
    _debug("stopAll");
    e.stopPropagation();
    e.stopImmediatePropagation();
  };

  const stopIfActivation = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      _debug("stopIfActivation");
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };

  return (
    <a
      href={props.href}
      class={props.class}
      // Mouse events
      onClick={stopAll}
      onMouseDown={stopAll}
      onMouseUp={stopAll}
      // Keyboard events
      onKeyDown={stopIfActivation}
      onKeyUp={stopIfActivation}
      onKeyPress={stopIfActivation}
      // Touch events
      onTouchStart={stopAll}
      onTouchEnd={stopAll}
      // Pointer events (covers mouse and touch)
      onPointerDown={stopAll}
      onPointerUp={stopAll}
    >
      {children}
    </a>
  );
};
