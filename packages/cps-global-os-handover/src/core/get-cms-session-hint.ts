import { CmsSessionHint, CmsSessionHintSchema } from "cps-global-configuration";
import { getRootUrl } from "./get-root-url";

export const getCmsSessionHint = async (): Promise<CmsSessionHint> => {
  const rootUrl = getRootUrl();
  if (!rootUrl) {
    throw new Error("Could not establish rootUrl");
  }

  const sessionHintUrl = `${new URL(rootUrl).origin}/global-components/cms-session-hint`;
  const response = await fetch(sessionHintUrl, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Error retrieving cms session hint ${response.statusText}`);
  }

  const sessionHint = await response.json();
  const result = CmsSessionHintSchema.safeParse(sessionHint);
  if (!result.success) {
    throw new Error(`Malformed cms session hint found ${result.error}`);
  }

  return result.data;
};
