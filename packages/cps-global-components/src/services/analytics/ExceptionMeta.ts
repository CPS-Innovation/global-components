export type ExceptionMeta = {
  type: "auth" | "data" | "init" | "state";
  code?: string;
  properties?: Record<string, unknown>;
};
