import { Config } from "cps-global-configuration";
import { FoundContext } from "./FoundContext";
import { replaceTagsInString } from "../../components/cps-global-menu/menu-config/helpers/replace-tags-in-string";
import { tryLocationMatch } from "./try-location-match";
import { makeConsole } from "../../logging/makeConsole";
import { Handover } from "../state/handover/Handover";
import { Result } from "../../utils/Result";

type Register = (arg: Record<string, unknown>) => void;
type ResetContextSpecificTags = (context: FoundContext) => void;

const { _debug } = makeConsole("initialiseContext");

export const initialiseContext = ({
  window,
  config: { CONTEXTS },
  handover,
  register,
  resetContextSpecificTags,
}: {
  window: { location: { href: string }; sessionStorage: Storage; localStorage: Storage };
  config: Pick<Config, "CONTEXTS">;
  handover: Result<Handover>;
  register: Register;
  resetContextSpecificTags: ResetContextSpecificTags;
}) => {
  const initialiseContextForContext = (): FoundContext => {
    const { href } = window.location;
    _debug("initialiseContextForContext", href);

    for (let contextIndex = 0; contextIndex < CONTEXTS.length; contextIndex++) {
      const context = CONTEXTS[contextIndex];

      const match = tryLocationMatch(href, context.path);
      if (!match) continue;

      const pathTags = match.groups || {};
      const cmsAuth = (context.cmsAuthFromStorageKey && (sessionStorage.getItem(context.cmsAuthFromStorageKey) || localStorage.getItem(context.cmsAuthFromStorageKey))) || "";

      const result: FoundContext = {
        ...context,
        msalRedirectUrl: replaceTagsInString(context.msalRedirectUrl, pathTags),
        found: true,
        pathTags,
        contextIndex,
        cmsAuth,
        currentHref: href,
      };
      resetContextSpecificTags(result);
      register({ context: result });

      if (context.takeTagsFromHandover && handover.found) {
        const { caseId, caseDetails } = handover.result;
        register({ handoverTags: { caseId: String(caseId), ...(caseDetails?.urn && { urn: caseDetails.urn }) } });
      }
      return result;
    }

    const notFound: FoundContext = { found: false };
    resetContextSpecificTags(notFound);
    register({ context: notFound });
    return notFound;
  };

  return { initialiseContextForContext };
};
