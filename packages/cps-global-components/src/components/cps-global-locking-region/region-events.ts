// `code` becomes the section KIND on the wire; `subjectId` the subject, for kinds
// that are scoped to one (a witness, a defendant). Together they build the
// section id the presence API expects: "<caseId>:KIND" or "<caseId>:KIND:<id>".
export type RegionDetail = { code: string; subjectId?: string };

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
