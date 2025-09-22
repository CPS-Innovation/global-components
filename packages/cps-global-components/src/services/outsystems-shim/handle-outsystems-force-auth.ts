import { handleForcedRedirect } from "cps-global-os-handover";
import { FoundContext } from "../context/find-context";
import { Config } from "cps-global-configuration";

export const handleOutSystemsForcedAuth = ({ window, context, config }: { window: Window; context: FoundContext; config: Config }) =>
  context.found && !!context.forceCmsAuthRefresh && !!config.OS_HANDOVER_URL && handleForcedRedirect({ window, handoverUrl: config.OS_HANDOVER_URL });
