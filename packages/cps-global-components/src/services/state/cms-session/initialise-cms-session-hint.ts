import { CmsSessionHint, CmsSessionHintSchema } from "cps-global-configuration";
import { fetchState } from "../fetch-state";
import { ApplicationFlags } from "../../application-flags/ApplicationFlags";
import { Result } from "../../../utils/Result";

type Register = (arg: { cmsSessionHint: Result<CmsSessionHint>; cmsSessionTags: { handoverEndpoint: string } }) => void;

export const initialiseCmsSessionHint = async ({ rootUrl, flags: { isOutSystems, environment }, register }: { rootUrl: string; flags: ApplicationFlags; register: Register }): Promise<Result<CmsSessionHint>> => {
  const cmsSessionHint: Result<CmsSessionHint> = isOutSystems && environment === "dev"
    ? // "dev" does not have a complete environment with CMS etc. OS apps in dev use their own login page to establish CMS auth.
      //  There is no auth handover to establish a cms session hint (even worse, the user is just going to get the last real
      //  session hint they created prior to logging in through the app login page).
      { found: true, result: { cmsDomains: [], isProxySession: true, handoverEndpoint: "not-used" } }
    : await fetchState({ rootUrl, url: "../cms-session-hint", schema: CmsSessionHintSchema });
  register({ cmsSessionHint, cmsSessionTags: { handoverEndpoint: cmsSessionHint.result?.handoverEndpoint || "" } });
  return cmsSessionHint;
};
