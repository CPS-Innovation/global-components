import { Getter, Setter, Subscription } from "@stencil/store/dist/types";
import { StoredState } from "../store";

export type SubscriptionFactory = (arg: { get: Getter<StoredState>; set: Setter<StoredState> }) => Subscription<StoredState>;
