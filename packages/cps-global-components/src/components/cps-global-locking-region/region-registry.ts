// PoC stub. Real implementation will broker enter/leave events across
// regions and integrate with the case-locking SignalR hub. For now these are
// no-ops so the component compiles and renders without depending on backend
// state.
export const regionRegistry = {
  enter: (_el: HTMLElement, _code: string) => {},
  leave: (_el: HTMLElement, _code: string) => {},
};
