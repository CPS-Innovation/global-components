import { createOutboundUrlDirect } from "cps-global-os-handover";
import { isOutSystemsApp } from "../../../../services/application-flags/is-outsystems-app";
import { State } from "../../../../store/store";

export const linkHandoverAdapter = ({
  flags: { isOutSystems },
  config: { OS_HANDOVER_URL, COOKIE_HANDOVER_URL },
  cmsSessionHint,
}: Pick<State, "config" | "flags" | "cmsSessionHint">) =>
  isOutSystems
    ? // If we are inside the OutSystems world then we assume we have adequate CMS auth.
      //  This is an assumption which could be challenged.
      (targetUrl: string) => targetUrl
    : // If we are outside of OutSystems and a link is pointing to OutSystems then we need to go
      //  via the auth handover endpoint to ensure OS has CMS auth
      (targetUrl: string) => {
        const shouldGoViaAuthHandover = isOutSystemsApp({ location: { href: targetUrl } }) && OS_HANDOVER_URL && COOKIE_HANDOVER_URL;
        if (shouldGoViaAuthHandover) {
          const cookieHandoverUrl = (cmsSessionHint.found && cmsSessionHint.result.handoverEndpoint) || COOKIE_HANDOVER_URL;
          return createOutboundUrlDirect({ cookieHandoverUrl, handoverUrl: OS_HANDOVER_URL, targetUrl });
        } else {
          return targetUrl;
        }
      };
