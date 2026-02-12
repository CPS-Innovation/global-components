import { Config } from "cps-global-configuration";
import { Build, ReadyStateHelper } from "../../store/store";
import { CmsSessionHint } from "cps-global-configuration";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { initialiseMockAnalytics } from "./initialise-mock-analytics";
import { initialiseAiAnalytics } from "./initialise-ai-analytics";
import { Result } from "../../utils/Result";

type Props = { window: Window; config: Config; readyState: ReadyStateHelper; build: Build; cmsSessionHint: Result<CmsSessionHint>; flags: ApplicationFlags };

export type Analytics = ReturnType<typeof initialiseAnalytics>;

export const initialiseAnalytics = ({ window, config, readyState, build, cmsSessionHint, flags }: Props) =>
  flags.e2eTestMode.isE2eTestMode ? initialiseMockAnalytics() : initialiseAiAnalytics({ window, config, readyState, build, cmsSessionHint });
