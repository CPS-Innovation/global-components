import { handleForcedRedirect } from "cps-global-os-handover";
import { FoundContext } from "../context/FoundContext";
import { Config } from "cps-global-configuration";
import { withLogging } from "../../logging/with-logging";

export const handleOutSystemsForcedAuth = withLogging(
  "handleOutSystemsForcedAuth",
  ({ window, context, config }: { window: Window; context: FoundContext; config: Config }) =>
    context.found && !!context.forceCmsAuthRefresh && !!config.OS_HANDOVER_URL && handleForcedRedirect({ window, handoverUrl: config.OS_HANDOVER_URL }),
);
