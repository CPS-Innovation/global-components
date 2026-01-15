import { v4 as uuidv4 } from "uuid";

let scriptLoadCorrelationId: string;
export const initialiseCorrelationIds = () => {
  const navigationCorrelationId = uuidv4();

  // For our analytics when scriptLoadCorrelationId === navigationCorrelationId then
  //  we know that it is the context when we first load, otherwise it is a context
  //  that has been navigated to SPA-wise.
  scriptLoadCorrelationId = scriptLoadCorrelationId || navigationCorrelationId;
  return { scriptLoadCorrelationId, navigationCorrelationId };
};
