import { createStore } from "@stencil/store";
import { Config } from "cps-global-configuration";
import { AuthResult } from "../services/auth/initialise-auth";

type Store = {
  status: "uninitialised" | "config-known" | "auth-known" | "broken";
  isOverrideMode?: boolean;
  isOutSystemsApp?: boolean;
  config?: Config;
  auth?: AuthResult;
  error?: Error;
};

const store = createStore<Store>({ status: "uninitialised" });

export const registerFlags = ({ isOverrideMode, isOutSystems }: { isOverrideMode: boolean; isOutSystems: boolean }) => {
  store.set("isOverrideMode", isOverrideMode);
  store.set("isOutSystemsApp", isOutSystems);
};

export const registerConfig = (config: Config) => {
  store.set("config", config);
  store.set("status", "config-known");
};

export const registerAuth = (auth: AuthResult) => {
  store.set("auth", auth);
  store.set("status", "auth-known");
};

export const registerBroken = (error: Error) => {
  store.set("status", "broken");
  store.set("error", error);
};

export const { state } = store;
