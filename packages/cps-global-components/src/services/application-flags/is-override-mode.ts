import { OVERRIDE_KEY, OVERRIDE_VALUE } from "../override-mode/constants";
export const isOverrideMode = ({ localStorage }: Window) => localStorage.getItem(OVERRIDE_KEY) === OVERRIDE_VALUE;
