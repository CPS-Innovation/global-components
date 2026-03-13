import { Config } from "cps-global-configuration";
import { Build } from "../../store/store";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { initialiseMockAnalytics } from "./initialise-mock-analytics";
import { initialiseAiAnalytics } from "./initialise-ai-analytics";
import { Result } from "../../utils/Result";
import { AuthHint } from "../state/auth-hint/initialise-auth-hint";

type Props = { window: Window; config: Config; build: Build; flags: ApplicationFlags; authHint?: Result<AuthHint> };

export type Analytics = ReturnType<typeof initialiseAnalytics>;

export const initialiseAnalytics = ({ window, config, build, flags, authHint }: Props) =>
  flags.e2eTestMode.isE2eTestMode ? initialiseMockAnalytics() : initialiseAiAnalytics({ window, config, build, authHint });
