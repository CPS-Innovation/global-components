import { CmsNavigateEvent } from "./CmsNavigateEvent";

export const initialiseNavigateCms = ({ window, rootUrl }: { window: Window; rootUrl: string }) => {
  window.document.addEventListener(CmsNavigateEvent.type, ((event: CmsNavigateEvent) => {
    const detail = event.detail;
    const params =
      detail.action === "task"
        ? `caseId=${detail.caseId}&taskId=${detail.taskId}`
        : detail.action === "modern-case"
          ? `caseId=${detail.caseId}&target=modern`
          : `caseId=${detail.caseId}`;

    const url = new URL(`../navigate-cms?${params}`, rootUrl).href;
    window.open(url, "_blank", "width=500,height=200,top=300,left=100");
  }) as EventListener);
};

export const dispatchCmsNavigate = (caseId: number) => {
  document.dispatchEvent(new CmsNavigateEvent({ action: "case", caseId }));
};

// Moves the user's open CMS Modern tab to the case (it can't open Modern if none is open)
export const dispatchModernCmsNavigate = (caseId: number) => {
  document.dispatchEvent(new CmsNavigateEvent({ action: "modern-case", caseId }));
};
