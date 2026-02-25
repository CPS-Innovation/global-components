import { CmsNavigateEvent } from "./CmsNavigateEvent";
import { Result } from "../../utils/Result";
import { Preview } from "cps-global-configuration";

export const initialiseNavigateCms = ({ rootUrl, preview }: { rootUrl: string; preview: Result<Preview> }) => {
  if (!preview.result?.openCaseInCms) {
    return;
  }

  document.addEventListener(CmsNavigateEvent.type, ((event: CmsNavigateEvent) => {
    const detail = event.detail;
    const params = detail.action === "task"
      ? `caseId=${detail.caseId}&taskId=${detail.taskId}`
      : `caseId=${detail.caseId}`;

    const url = new URL(`../navigate-cms?${params}`, rootUrl).href;
    window.open(url, "_blank", "width=500,height=300");
  }) as EventListener);
};

export const dispatchCmsNavigate = (caseId: number) => {
  document.dispatchEvent(new CmsNavigateEvent({ action: "case", caseId }));
};
