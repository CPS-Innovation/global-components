import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { Config } from "cps-global-configuration";
import { AuthResult } from "../auth/initialise-auth";

const STORAGE_PREFIX = "cps_global_components";

declare global {
  interface Window {
    cps_global_components_build?: // title case properties as we put these values straight
    // into analytics and that is the convention there
    { Branch: string; Sha: string; RunId: number; Timestamp: string };
  }
}

export const initialiseAnalytics = ({ APP_INSIGHTS_KEY, ENVIRONMENT }: Config, authResult: AuthResult) => {
  if (!APP_INSIGHTS_KEY) {
    return { appInsights: null, ENVIRONMENT };
  }

  const connectionString = [
    `InstrumentationKey=${APP_INSIGHTS_KEY}`,
    "IngestionEndpoint=https://uksouth-1.in.applicationinsights.azure.com/",
    "LiveEndpoint=https://uksouth.livediagnostics.monitor.azure.com/",
    "ApplicationId=3dafc37d-8c9c-4480-90fc-532ac2b8bba2",
  ].join(";");

  const appInsights = new ApplicationInsights({
    config: {
      connectionString,
      // Make sure the names of the session storage buffers do not clash with the host
      //  app's own use of app insights
      namePrefix: STORAGE_PREFIX,
      // Not sure what this one does: I think it is the storage object used when app insights
      //  tracking requests are not getting through to the server (network down?)
      storagePrefix: STORAGE_PREFIX,
    },
  });

  appInsights.loadAppInsights();

  let authValues = { IsAuthed: authResult.isAuthed } as Record<string, any>;
  if (authResult.isAuthed) {
    authValues = { Username: authResult.username, ...authValues };
  }

  const trackPageView = () => {
    appInsights.trackPageView({ properties: { Environment: ENVIRONMENT, ...authValues, ...window.cps_global_components_build } });
  };

  window.navigation.addEventListener("navigate", trackPageView);
  trackPageView();
};
