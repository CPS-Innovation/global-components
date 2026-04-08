import { v4 as uuidv4 } from "uuid";

export type CorrelationIds = { scriptLoadCorrelationId: string; navigationCorrelationId: string };

type Register = (arg: { correlationIds: CorrelationIds }) => void;
type RegisterCorrelationIdsWithAnalytics = (ids: CorrelationIds) => void;

let scriptLoadCorrelationId: string;

export const initialiseCorrelationIds = ({
  register,
  registerCorrelationIdsWithAnalytics,
}: {
  register: Register;
  registerCorrelationIdsWithAnalytics: RegisterCorrelationIdsWithAnalytics;
}) => {
  const initialiseCorrelationIdsForContext = () => {
    const navigationCorrelationId = uuidv4();

    // For our analytics when scriptLoadCorrelationId === navigationCorrelationId then
    //  we know that it is the context when we first load, otherwise it is a context
    //  that has been navigated to SPA-wise.
    scriptLoadCorrelationId = scriptLoadCorrelationId || navigationCorrelationId;
    const correlationIds = { scriptLoadCorrelationId, navigationCorrelationId };
    register({ correlationIds });
    registerCorrelationIdsWithAnalytics(correlationIds);
    return correlationIds;
  };

  return { initialiseCorrelationIdsForContext };
};
