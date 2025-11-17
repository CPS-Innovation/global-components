import { FunctionalComponent, h } from "@stencil/core";

export const InertLink: FunctionalComponent<{ href: string; class?: string }> = (props, children) => {
  const stopAll = (e: Event) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  };

  const stopIfActivation = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
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
