import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { CONFIG } from "./config";

const STORAGE_PREFIX = "CPS_global_components";
const { ENVIRONMENT, APP_INSIGHTS_KEY } = CONFIG;

let appInsights: ApplicationInsights | undefined;

const initialise = () => {
  if (!APP_INSIGHTS_KEY) {
    return;
  }

  const connectionString = [
    `InstrumentationKey=${APP_INSIGHTS_KEY}`,
    "IngestionEndpoint=https://uksouth-1.in.applicationinsights.azure.com/",
    "LiveEndpoint=https://uksouth.livediagnostics.monitor.azure.com/",
    "ApplicationId=3dafc37d-8c9c-4480-90fc-532ac2b8bba2",
  ].join(";");

  appInsights = new ApplicationInsights({
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
};

initialise();

export const trackPageView = () => appInsights?.trackPageView({ properties: { Environment: ENVIRONMENT } });
