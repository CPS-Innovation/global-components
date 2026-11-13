export type FocusTarget = "first" | "last" | "next" | "previous";

// Which option to focus, given the focused one (-1 when it's the trigger). Next and
// previous wrap round.
export const focusTargetIndex = (target: FocusTarget, current: number, count: number) => {
  switch (target) {
    case "first":
      return 0;
    case "last":
      return count - 1;
    case "next":
      return (current + 1) % count;
    case "previous":
      return current <= 0 ? count - 1 : current - 1;
  }
};
