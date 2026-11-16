import { CmsNavigateDetail, CmsNavigateEvent } from "./CmsNavigateEvent";

// Relative to rootUrl (.../global-components/<env>/<bundle>.js), so these land on the
// proxy that serves the bundle. Modern's route is under /api/ because the proxy needs
// the Cms-Auth-Values cookie there (Path=/api/) to open Modern from cold.
const navigatePath = (detail: CmsNavigateDetail) => {
  if (detail.action === "modern-case") {
    return `/api/global-components/navigate-cms-modern?caseId=${detail.caseId}`;
  }
  if (detail.action === "task") {
    return `../navigate-cms?caseId=${detail.caseId}&taskId=${detail.taskId}`;
  }
  return `../navigate-cms?caseId=${detail.caseId}`;
};

export const initialiseNavigateCms = ({ window, rootUrl }: { window: Window; rootUrl: string }) => {
  window.document.addEventListener(CmsNavigateEvent.type, ((event: CmsNavigateEvent) => {
    const url = new URL(navigatePath(event.detail), rootUrl).href;
    window.open(url, "_blank", "width=500,height=200,top=300,left=100");
  }) as EventListener);
};

export const dispatchCmsNavigate = (caseId: number) => {
  document.dispatchEvent(new CmsNavigateEvent({ action: "case", caseId }));
};

// Moves the user's CMS Modern tab to the case, opening one if none is open
export const dispatchModernCmsNavigate = (caseId: number) => {
  document.dispatchEvent(new CmsNavigateEvent({ action: "modern-case", caseId }));
};
