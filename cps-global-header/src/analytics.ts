import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { APP_INSIGHTS_KEY } from "./config";

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
    },
  });

  appInsights.loadAppInsights();
};

initialise();

export const trackPageView = () => appInsights?.trackPageView();
