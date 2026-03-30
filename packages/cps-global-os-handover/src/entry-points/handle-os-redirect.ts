import {
  setCmsSessionHint,
  storeAuth,
} from "../core/storage";
import { stripParams } from "../core/params";
import { paramKeys, stages } from "../core/constants";
import { getCmsSessionHint } from "../core/get-cms-session-hint";

export const handleOsRedirect = async (window: Window) => {
  const { stage, nextUrl } = handleOsRedirectInternal(window.location.href);
  await handleSettingCmsSessionHint({ stage, nextUrl });
  window.location.replace(nextUrl);
};

/** Used at the point of redirecting on the OS domain.  */
export const handleOsRedirectInternal = (currentUrl: string) => {
  const url = new URL(currentUrl);
  const [stage] = stripParams(url, paramKeys.STAGE);

  switch (stage) {
    case stages.OS_COOKIE_RETURN: {
      const [target, cookies, token] = stripParams(
        url,
        paramKeys.R,
        paramKeys.COOKIES,
        paramKeys.TOKEN,
      );

      storeAuth(cookies, token, localStorage);

      return { stage, nextUrl: target };
    }
    default:
      throw new Error(
        `Unknown ${paramKeys.STAGE} query parameter: ${stage || "empty"}`,
      );
  }
};

const handleSettingCmsSessionHint = async ({
  stage,
  nextUrl,
}: {
  stage: string;
  nextUrl: string;
}) => {
  try {
    if (stage !== stages.OS_COOKIE_RETURN) {
      return;
    }

    if (
      !new URL(nextUrl).pathname.toLowerCase().startsWith("/casework_blocks/")
    ) {
      return;
    }

    const cmsSessionHint = await getCmsSessionHint();
    setCmsSessionHint(cmsSessionHint, localStorage);
  } catch (err) {
    console.log(`handleSettingCmsSessionHint error: ${err}`);
  }
};
