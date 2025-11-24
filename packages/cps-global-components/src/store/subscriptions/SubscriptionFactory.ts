import { Getter, Subscription } from "@stencil/store/dist/types";
import { MergeTags, Register, Store, StoredState } from "../store";

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
}) => { type: "subscription"; handler: Subscription<StoredState> } | { type: "onChange"; handler: StoreHandlerDef<StoredState> };

export const applyOnChangeHandler = <K extends keyof StoredState>(store: Store, handler: TypedHandler<StoredState, K>) => {
  store.onChange(handler.propName, handler.handler);
  const val = store.get(handler.propName);
  handler.handler(val);
};
