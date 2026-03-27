export type AdDiagnosticsCollector = {
  add: (props: Record<string, unknown>) => void;
  get: () => Record<string, unknown>;
};

export const createAdDiagnosticsCollector = (): AdDiagnosticsCollector => {
  let properties: Record<string, unknown> = {};
  return {
    add: (props) => { properties = { ...properties, ...props }; },
    get: () => properties,
  };
};
