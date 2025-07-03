(function () {
    'use strict';

    const paramKeys = {
        STAGE: "stage",
        COOKIES: "cc",
        R: "r",
        TOKEN: "cms-modern-token",
    };
    const stages = {
        OS_OUTBOUND: "os-outbound",
        OS_COOKIE_RETURN: "os-cookie-return",
        OS_TOKEN_RETURN: "os-token-return",
    };
    const stripParams = (url, ...keys) => keys.map((key) => {
        const value = url.searchParams.get(key);
        url.searchParams.delete(key);
        return value;
    });
    const setParams = (url, params) => Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const createUrl = (baseUrl, params) => {
        const url = new URL(baseUrl);
        setParams(url, params);
        return url;
    };
    const handleRedirect = ({ currentUrl, cookieHandoverUrl, tokenHandoverUrl, }) => {
        const url = new URL(currentUrl);
        const [stage] = stripParams(url, paramKeys.STAGE);
        switch (stage) {
            case stages.OS_OUTBOUND: {
                setParams(url, { [paramKeys.STAGE]: stages.OS_COOKIE_RETURN });
                const nextUrl = createUrl(cookieHandoverUrl, {
                    [paramKeys.R]: url.toString(),
                });
                return nextUrl.toString();
            }
            case stages.OS_COOKIE_RETURN: {
                setParams(url, { [paramKeys.STAGE]: stages.OS_TOKEN_RETURN });
                const [cookies] = stripParams(url, paramKeys.COOKIES);
                const nextUrl = createUrl(tokenHandoverUrl, {
                    [paramKeys.R]: url.toString(),
                    [paramKeys.COOKIES]: cookies,
                });
                return nextUrl.toString();
            }
            case stages.OS_TOKEN_RETURN: {
                const [target, cookies, token] = stripParams(url, paramKeys.R, paramKeys.COOKIES, paramKeys.TOKEN);
                console.log({ target, cookies, token });
                return target;
            }
            default:
                throw new Error(`Unknown ${paramKeys.STAGE} query parameter: ${stage || "empty"}`);
        }
    };

    // Browser entry point that automatically executes handleRedirect
    const COOKIE_HANDOVER_URL = window.cps_global_components_cookie_handover_url;
    const TOKEN_HANDOVER_URL = window.cps_global_components_token_handover_url;
    if (!COOKIE_HANDOVER_URL) {
        throw new Error(`window.cps_global_components_cookie_handover_url not specified`);
    }
    if (!TOKEN_HANDOVER_URL) {
        throw new Error(`window.cps_global_components_token_handover_url not specified`);
    }
    const currentUrl = window.location.href;
    const nextUrl = handleRedirect({
        currentUrl,
        cookieHandoverUrl: COOKIE_HANDOVER_URL,
        tokenHandoverUrl: TOKEN_HANDOVER_URL,
    });
    window.location.href = nextUrl;

})();
//# sourceMappingURL=auth-handover.js.map
