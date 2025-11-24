import { Getter, Subscription } from "@stencil/store/dist/types";
import { MergeTags, Register, StoredState } from "../store";

type StoreHandlerDef<T> = {
  [K in keyof T]: {
    propName: K;
    handler: (newValue: T[K]) => void;
  };
}[keyof T];

type TypedHandler<T, K extends keyof T> = {
  propName: K;
  handler: (value: T[K]) => void;
};

export type SubscriptionFactory = (arg: {
  get: Getter<StoredState>;
  register: Register;
  mergeTags: MergeTags;
}) => { triggerSetOnCreation?: keyof StoredState } & ({ type: "subscription"; handler: Subscription<StoredState> } | { type: "onChange"; handler: StoreHandlerDef<StoredState> });
