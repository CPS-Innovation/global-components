export type ExceptionMeta = {
  type: "auth" | "data" | "init";
  code?: string;
  properties?: Record<string, unknown>;
};
