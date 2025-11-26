export type CorrelationIds = {
  scriptLoadCorrelationId: string;
  navigationCorrelationId: string;
};

export const emptyCorrelationIds: CorrelationIds = {
  scriptLoadCorrelationId: "",
  navigationCorrelationId: "",
};
