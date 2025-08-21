import { Config } from "cps-global-configuration";
import { AuthResult } from "../services/auth/initialise-auth";
import { FoundContext } from "../services/context/find-context";
import { createStore } from "@stencil/store";

export type Flags = { isOverrideMode: boolean; isOutSystems: boolean };
export type Tags = Record<string, string>;

export type Register = typeof register;

export type Store = {
  flags?: Flags;
  config?: Config;
  auth?: AuthResult;
  context?: FoundContext;
  tags?: Tags;
  fatalInitialisationError?: Error;
};

export let store: ReturnType<typeof createStore<Store>> = undefined;

export const initialiseStore = () => {
  store = createStore<Store>(
    () => ({}),
    (newValue, oldValue) => JSON.stringify(newValue) !== JSON.stringify(oldValue),
  );
};

export const register = (arg: Partial<Store>) => {
  (Object.keys(arg) as (keyof Store)[]).forEach(key => store.set(key, arg[key]));
};
