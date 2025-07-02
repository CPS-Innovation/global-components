// Browser entry point that automatically executes handleRedirect
import { handleRedirect as internalHandleRedirect } from "./handover";

const COOKIE_HANDOVER_URL = process.env.COOKIE_HANDOVER_URL;
const TOKEN_HANDOVER_URL = process.env.TOKEN_HANDOVER_URL;

if (!COOKIE_HANDOVER_URL) {
  throw new Error(`COOKIE_HANDOVER_URL environment variable not specified`);
}

if (!TOKEN_HANDOVER_URL) {
  throw new Error(`TOKEN_HANDOVER_URL environment variable not specified`);
}
const currentUrl = window.location.href;

const nextUrl = internalHandleRedirect({
  currentUrl,
  cookieHandoverUrl: COOKIE_HANDOVER_URL,
  tokenHandoverUrl: TOKEN_HANDOVER_URL,
});

window.location.href = nextUrl;
