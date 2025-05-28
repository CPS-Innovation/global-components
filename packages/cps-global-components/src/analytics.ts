import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { CONFIG_ASYNC } from "./config";

const STORAGE_PREFIX = "CPS_global_components";

const initialisationPromise = CONFIG_ASYNC.then(({ APP_INSIGHTS_KEY }) => {
  if (!APP_INSIGHTS_KEY) {
    return null;
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
  return appInsights;
});

export const trackPageViewAsync = async () => {
  const [appInsights, { ENVIRONMENT }] = await Promise.all([initialisationPromise, CONFIG_ASYNC]);
  appInsights?.trackPageView({ properties: { Environment: ENVIRONMENT } });
};
