import { Config } from "cps-global-configuration";
import { findContext } from "./find-context";

export const initialiseContext = ({ window, config: { CONTEXTS } }: { window: Window; config: Config }) => findContext(CONTEXTS, window);
