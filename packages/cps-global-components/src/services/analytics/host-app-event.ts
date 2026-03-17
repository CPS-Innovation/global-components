export type HostAppEventData = { action: string; elementId: string; contextIds: string };

export class HostAppEvent extends CustomEvent<HostAppEventData> {
  static type = "cps-global-components-host-app-event";
  constructor(detail: HostAppEventData) {
    super(HostAppEvent.type, {
      detail,
      bubbles: true,
      cancelable: true,
    });
  }
}

export const dispatchHostAppEvent = (detail: HostAppEventData) => {
  window.dispatchEvent(new HostAppEvent(detail));
};
