import { CmsSessionHint, CmsSessionHintSchema } from "cps-global-configuration";
import { fetchState } from "../fetch-state";
import { ApplicationFlags } from "../../application-flags/ApplicationFlags";
import { Result } from "../../../utils/Result";

export const initialiseCmsSessionHint = ({ rootUrl, flags: { isOutSystems, environment } }: { rootUrl: string; flags: ApplicationFlags }): Promise<Result<CmsSessionHint>> =>
  isOutSystems && environment === "dev"
    ? // "dev" does not have a complete environment with CMS etc. OS apps in dev use their own login page to establish CMS auth.
      //  There is no auth handover to establish a cms session hint (even worse, the user is just going to get the last real
      //  session hint they created prior to logging in through the app login page).
      Promise.resolve({ found: true, result: { cmsDomains: [], isProxySession: true, handoverEndpoint: "not-used" } })
    : fetchState({ rootUrl, url: "../cms-session-hint", schema: CmsSessionHintSchema });
