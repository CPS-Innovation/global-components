import { Config } from "cps-global-configuration";
import { AuthResult } from "../services/auth/initialise-auth";
import { FoundContext } from "../services/context/find-context";
import { createCustomStore } from "./custom-subscription";

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

export const store = createCustomStore<Store>(
  () => ({}),
  (newValue, oldValue) => JSON.stringify(newValue) !== JSON.stringify(oldValue),
);

export const register = (arg: Partial<Store>) => {
  //console.log(arg);
  (Object.keys(arg) as (keyof Store)[]).forEach(key => store.set(key, arg[key]));
};

export const { state, onChange } = store;
