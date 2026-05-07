export type RegionDetail = { code: string };

export class RegionEnterEvent extends CustomEvent<RegionDetail> {
  static type = "cps-global-locking-region-enter" as const;
  constructor(detail: RegionDetail) {
    super(RegionEnterEvent.type, { detail, bubbles: true, cancelable: false });
  }
}

export class RegionLeaveEvent extends CustomEvent<RegionDetail> {
  static type = "cps-global-locking-region-leave" as const;
  constructor(detail: RegionDetail) {
    super(RegionLeaveEvent.type, { detail, bubbles: true, cancelable: false });
  }
}
