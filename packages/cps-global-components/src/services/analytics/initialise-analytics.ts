import { Config } from "cps-global-configuration";
import { Build } from "../../store/store";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { initialiseMockAnalytics } from "./initialise-mock-analytics";
import { initialiseAiAnalytics } from "./initialise-ai-analytics";

type Props = { window: Window; config: Config; build: Build; flags: ApplicationFlags };

export type Analytics = ReturnType<typeof initialiseAnalytics>;

export const initialiseAnalytics = ({ window, config, build, flags }: Props) =>
  flags.e2eTestMode.isE2eTestMode ? initialiseMockAnalytics() : initialiseAiAnalytics({ window, config, build });
