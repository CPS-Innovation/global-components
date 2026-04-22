import { Config } from "cps-global-configuration";
import { Register } from "../../store/store";
import { fetchState } from "../state/fetch-state";
import { StatePutResponseSchema } from "../state/StatePutResponse";
import { SilentFlowDiagnostic, SilentFlowDiagnostics, SilentFlowDiagnosticsSchema, emptySilentFlowDiagnostics } from "./silent-flow-diagnostics";
import { ProbeIframeLoadDiagnostic, ProbeIframeLoadDiagnosticSchema } from "./probe-iframe-load-diagnostic";
import { probeIframeLoad } from "./probe-iframe-load";
import { TrackEvent } from "../analytics/analytics-event";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";

const DEFAULT_SILENT_FLOW_DIAGNOSTICS_LENGTH = 5;
const DEFAULT_PROBE_IFRAME_TIMEOUT_MS = 3000;
const DEFAULT_PROBE_IFRAME_REFRESH_PERIOD_MINS = 15;

export const initialiseDiagnostics = ({
  window,
  rootUrl,
  config,
  flags,
  register,
  trackEvent,
}: {
  window: Window;
  rootUrl: string;
  config: Config;
  flags: ApplicationFlags;
  register: Register;
  trackEvent: TrackEvent;
}) => {
  const silentFlowsLength = config.SILENT_FLOW_DIAGNOSTICS_LENGTH ?? DEFAULT_SILENT_FLOW_DIAGNOSTICS_LENGTH;

  const silentFlowDiagnostics: SilentFlowDiagnostics = emptySilentFlowDiagnostics();

  const put = () =>
    fetchState({
      rootUrl,
      url: "../state/diagnostics/silent-flow",
      schema: StatePutResponseSchema,
      data: silentFlowDiagnostics,
    });

  const silentFlowDiagnosticsPromise = fetchState({
    rootUrl,
    url: "../state/diagnostics/silent-flow",
    schema: SilentFlowDiagnosticsSchema,
    defaultResultWhenNull: emptySilentFlowDiagnostics(),
  });

  silentFlowDiagnosticsPromise.then(rawResult => {
    const registered = rawResult.found ? { ...rawResult, result: { ...rawResult.result, silentFlows: rawResult.result.silentFlows.slice(0, silentFlowsLength) } } : rawResult;
    if (registered.found) {
      silentFlowDiagnostics.silentFlows.push(...registered.result.silentFlows);
    }
    register({ silentFlowDiagnostics: registered });

    if (silentFlowsLength === 0 && rawResult.found && rawResult.result.silentFlows.length > 0) {
      silentFlowDiagnostics.silentFlows.length = 0;
      put();
    }
  });

  const addSilentFlowDiagnostics = (entry: SilentFlowDiagnostic) => {
    if (silentFlowsLength === 0) {
      return;
    }

    silentFlowDiagnosticsPromise.then(() => {
      const existingIndex = entry.operationId ? silentFlowDiagnostics.silentFlows.findIndex(f => f.operationId === entry.operationId) : -1;
      if (existingIndex >= 0) {
        silentFlowDiagnostics.silentFlows[existingIndex] = { ...silentFlowDiagnostics.silentFlows[existingIndex], ...entry };
      } else {
        silentFlowDiagnostics.silentFlows.unshift(entry);
        silentFlowDiagnostics.silentFlows.length = Math.min(silentFlowDiagnostics.silentFlows.length, silentFlowsLength);
      }
      put();
    });
  };

  runProbeIframeLoadIfUnrecorded({ window, rootUrl, config, flags, trackEvent });

  return { silentFlowDiagnostics, addSilentFlowDiagnostics };
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

  const [{ outcome, durationMs }, localNetworkAccessPermission] = await Promise.all([
    probeIframeLoad({ window, url, timeoutMs }),
    window.navigator.permissions.query({ name: "local-network-access" as PermissionName }).then(
      status => status.state,
      () => undefined,
    ),
  ]);
  const diagnostic: ProbeIframeLoadDiagnostic = { outcome, durationMs, timestamp: Date.now(), localNetworkAccessPermission };
  fetchState({
    rootUrl,
    url: "../state/diagnostics/probe-iframe-load",
    schema: StatePutResponseSchema,
    data: diagnostic,
  });
  trackEvent({ name: "iframe-load-probe", outcome, durationMs, localNetworkAccessPermission });
};
