import { ApplicationFlags, Config, fetchState, StatePutResponseSchema } from "cps-global-configuration";
import { ProbeIframeLoadDiagnostic, ProbeIframeLoadDiagnosticSchema } from "./probe-iframe-load-diagnostic";
import { ProbeNavigatorPermissionsDiagnostic, ProbeNavigatorPermissionsDiagnosticSchema } from "./probe-navigator-permissions-diagnostic";
import { probeIframeLoad } from "./probe-iframe-load";
import { TrackEvent } from "../analytics/analytics-event";

const DEFAULT_PROBE_IFRAME_TIMEOUT_MS = 3000;
const DEFAULT_PROBE_IFRAME_REFRESH_PERIOD_MINS = 15;

export const initialiseDiagnostics = ({
  window,
  rootUrl,
  config,
  flags,
  trackEvent,
}: {
  window: Window;
  rootUrl: string;
  config: Config;
  flags: ApplicationFlags;
  trackEvent: TrackEvent;
}) => {
  runProbeIframeLoadIfUnrecorded({ window, rootUrl, config, flags, trackEvent });
  runProbeNavigatorPermissionsIfUnrecorded({ window, rootUrl, config, trackEvent });
};

// The probe can't run on OutSystems-hosted pages because their CSP's frame-src
// doesn't include blob.core.windows.net — iframe navigation is blocked and the
// result would be a spurious "timeout-public" that we'd then cache indefinitely.
const runProbeIframeLoadIfUnrecorded = async ({
  window,
  rootUrl,
  config,
  flags,
  trackEvent,
}: {
  window: Window;
  rootUrl: string;
  config: Config;
  flags: ApplicationFlags;
  trackEvent: TrackEvent;
}) => {
  if (flags.isOutSystems || !config.PROBE_IFRAME_BASE_URL || !config.ENVIRONMENT) {
    return;
  }

  const refreshPeriodMins = config.PROBE_IFRAME_REFRESH_PERIOD_MINS ?? DEFAULT_PROBE_IFRAME_REFRESH_PERIOD_MINS;
  if (refreshPeriodMins === 0) {
    return;
  }
  const refreshPeriodMs = refreshPeriodMins * 60 * 1000;

  const existing = await fetchState({
    rootUrl,
    url: "../state/diagnostics/probe-iframe-load",
    schema: ProbeIframeLoadDiagnosticSchema,
  });

  if (existing.found && Date.now() - existing.result.timestamp < refreshPeriodMs) {
    return;
  }

  const url = `${config.PROBE_IFRAME_BASE_URL}/${config.ENVIRONMENT}/probe-iframe-load.html`;
  const timeoutMs = config.PROBE_IFRAME_TIMEOUT_MS ?? DEFAULT_PROBE_IFRAME_TIMEOUT_MS;

  const { outcome, durationMs } = await probeIframeLoad({ window, url, timeoutMs });
  const diagnostic: ProbeIframeLoadDiagnostic = { outcome, durationMs, timestamp: Date.now() };
  fetchState({
    rootUrl,
    url: "../state/diagnostics/probe-iframe-load",
    schema: StatePutResponseSchema,
    data: diagnostic,
  });
  trackEvent({ name: "iframe-load-probe", outcome, durationMs });
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
