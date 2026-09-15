import { Config, fetchState, StatePutResponseSchema } from "cps-global-configuration";
import { ProbeNavigatorPermissionsDiagnostic, ProbeNavigatorPermissionsDiagnosticSchema } from "./probe-navigator-permissions-diagnostic";
import { TrackEvent } from "../analytics/analytics-event";

export const initialiseDiagnostics = ({
  window,
  rootUrl,
  config,
  trackEvent,
}: {
  window: Window;
  rootUrl: string;
  config: Config;
  trackEvent: TrackEvent;
}) => {
  runProbeNavigatorPermissionsIfUnrecorded({ window, rootUrl, config, trackEvent });
};

const runProbeNavigatorPermissionsIfUnrecorded = async ({
  window,
  rootUrl,
  config,
  trackEvent,
}: {
  window: Window;
  rootUrl: string;
  config: Config;
  trackEvent: TrackEvent;
}) => {
  const refreshPeriodMins = config.PROBE_NAVIGATOR_PERMISSIONS_REFRESH_PERIOD_MINS;
  if (!refreshPeriodMins) {
    return;
  }
  const refreshPeriodMs = refreshPeriodMins * 60 * 1000;

  const hostname = window.location.hostname;
  const url = `../state/diagnostics/probe-navigator-permissions/${hostname}`;

  const existing = await fetchState({
    rootUrl,
    url,
    schema: ProbeNavigatorPermissionsDiagnosticSchema,
  });

  if (existing.found && Date.now() - existing.result.timestamp < refreshPeriodMs) {
    return;
  }

  const localNetworkAccessPermission = await window.navigator.permissions.query({ name: "local-network-access" as PermissionName }).then(
    status => status.state,
    () => undefined,
  );
  const timestamp = Date.now();
  const diagnostic: ProbeNavigatorPermissionsDiagnostic = { timestamp, localNetworkAccessPermission };
  fetchState({
    rootUrl,
    url,
    schema: StatePutResponseSchema,
    data: diagnostic,
  });
  trackEvent({ name: "probe-navigator-permissions", hostname, timestamp, localNetworkAccessPermission });
};
