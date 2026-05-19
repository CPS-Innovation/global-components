// Error-logging delegate handed in by the host so library errors surface
// through the host's logger (namespace, styling, jest-suppression). The
// library accepts a structural function type — no dependency on the host's
// makeConsole shape.
export type LogError = (...data: unknown[]) => void;
