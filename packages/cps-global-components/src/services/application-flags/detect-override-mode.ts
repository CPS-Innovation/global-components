import { OVERRIDE_KEY, OVERRIDE_VALUE } from "../override-mode/constants";
export const detectOverrideMode = (window: Window) => window.localStorage.getItem(OVERRIDE_KEY) === OVERRIDE_VALUE;
