// Structural shape of a silent-flow diagnostic entry. The host application
// (cps-global-components) defines its own zod-validated copy in
// services/diagnostics/silent-flow-diagnostics.ts; the structures must stay
// in sync. We don't import the zod-based version because the auth library
// shouldn't pull in the host's diagnostics machinery.

export type SilentFlowDiagnostic = {
  time: number;
  url: string;
  operationId?: string;
  completedTime?: number;
  outcome?: "complete" | "failure";
  errorCode?: string;
};
