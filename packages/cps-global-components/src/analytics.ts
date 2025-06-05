import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { CONFIG_ASYNC } from "./config";

const STORAGE_PREFIX = "cps_global_components";

let cachedInitialisationPromise: Promise<{ appInsights: ApplicationInsights; ENVIRONMENT: string }>;

const initialisationPromise = () => {
  if (cachedInitialisationPromise) {
    return cachedInitialisationPromise;
  }

  const internal = async () => {
    const { APP_INSIGHTS_KEY, ENVIRONMENT } = await CONFIG_ASYNC();
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
    return { appInsights, ENVIRONMENT };
  };
  cachedInitialisationPromise = internal();

  return cachedInitialisationPromise;
};

declare global {
  interface Window {
    cps_global_components_build?: // title case properties as we put these values straight
    // into analytics and that is the convention there
    { Branch: string; Sha: string; RunId: number };
  }
}

export const trackPageViewAsync = async () => {
  const { appInsights, ENVIRONMENT } = await initialisationPromise();
  appInsights?.trackPageView({ properties: { Environment: ENVIRONMENT, ...window.cps_global_components_build } });
};
