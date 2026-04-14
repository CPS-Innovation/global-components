import { Config } from "cps-global-configuration";
import { Register } from "../../store/store";
import { fetchState } from "../state/fetch-state";
import { StatePutResponseSchema } from "../state/StatePutResponse";
import { SilentFlowDiagnostic, SilentFlowDiagnostics, SilentFlowDiagnosticsSchema, emptySilentFlowDiagnostics } from "./silent-flow-diagnostics";

const DEFAULT_SILENT_FLOW_DIAGNOSTICS_LENGTH = 5;

export const initialiseDiagnostics = ({ rootUrl, config, register }: { rootUrl: string; config: Config; register: Register }) => {
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
      silentFlowDiagnostics.silentFlows.unshift(entry);
      silentFlowDiagnostics.silentFlows.length = Math.min(silentFlowDiagnostics.silentFlows.length, silentFlowsLength);
      put();
    });
  };

  return { silentFlowDiagnostics, addSilentFlowDiagnostics };
};
