import type { Build } from "../../store/store";

type Register = (arg: { build: Build }) => void;

export const initialiseBuild = ({ window, register }: { window: Window & typeof globalThis; register: Register }) => {
  const build = window.cps_global_components_build;
  register({ build });
  return build;
};
