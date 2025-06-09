import { initialisation } from "./initialisation";

declare global {
  interface Window {
    cps_global_components_build?: // title case properties as we put these values straight
    // into analytics and that is the convention there
    { Branch: string; Sha: string; RunId: number; Timestamp: string };
  }
}
export const trackPageViewAsync = async () => {
  const { appInsights, ENVIRONMENT } = await initialisation();
  appInsights?.trackPageView({ properties: { Environment: ENVIRONMENT, ...window.cps_global_components_build } });
};
