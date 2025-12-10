import { Config } from "cps-global-configuration";
import { AuthResult } from "../auth/AuthResult";
import { Build, ReadyStateHelper } from "../../store/store";
import { CmsSessionHintResult } from "../cms-session/CmsSessionHint";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { initialiseMockAnalytics } from "./initialise-mock-analytics";
import { initialiseAiAnalytics } from "./initialise-ai-analytics";

type Props = { window: Window; config: Config; auth: AuthResult; readyState: ReadyStateHelper; build: Build; cmsSessionHint: CmsSessionHintResult; flags: ApplicationFlags };

export type Analytics = ReturnType<typeof initialiseAnalytics>;

export const initialiseAnalytics = ({ window, config, auth, readyState, build, cmsSessionHint, flags }: Props) =>
  flags.e2eTestMode.isE2eTestMode ? initialiseMockAnalytics() : initialiseAiAnalytics({ window, config, auth, readyState, build, cmsSessionHint });
