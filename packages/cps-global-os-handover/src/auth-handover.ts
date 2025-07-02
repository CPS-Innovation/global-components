// Browser entry point that automatically executes handleRedirect
import { handleRedirect } from "./handover";

declare global {
  interface Window {
    cps_global_components_cookie_handover_url: string;
    cps_global_components_token_handover_url: string;
  }
}

const COOKIE_HANDOVER_URL = window.cps_global_components_cookie_handover_url;
const TOKEN_HANDOVER_URL = window.cps_global_components_token_handover_url;

if (!COOKIE_HANDOVER_URL) {
  throw new Error(
    `window.cps_global_components_cookie_handover_url not specified`
  );
}

if (!TOKEN_HANDOVER_URL) {
  throw new Error(
    `window.cps_global_components_token_handover_url not specified`
  );
}

const currentUrl = window.location.href;

const nextUrl = handleRedirect({
  currentUrl,
  cookieHandoverUrl: COOKIE_HANDOVER_URL,
  tokenHandoverUrl: TOKEN_HANDOVER_URL,
});

window.location.href = nextUrl;
