import { Getter, Setter, Subscription } from "@stencil/store/dist/types";
import { StoredState } from "../store";

type TriggerArgs = {
  key: keyof StoredState;
};

export type SubscriptionFactory = (arg: { get: Getter<StoredState>; set: Setter<StoredState> }) => { triggerSetOnRegister?: TriggerArgs; subscription: Subscription<StoredState> };
