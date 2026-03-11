export type CmsNavigateDetail =
  | { action: "case"; caseId: number }
  | { action: "task"; caseId: number; taskId: number };

export class CmsNavigateEvent extends CustomEvent<CmsNavigateDetail> {
  static type = "cps-global-cms-navigate" as const;
  constructor(detail: CmsNavigateDetail) {
    super(CmsNavigateEvent.type, { detail, bubbles: true, cancelable: true });
  }
}
