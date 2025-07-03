const paramKeys = {
    STAGE: "stage",
    R: "r"};
const stages = {
    OS_OUTBOUND: "os-outbound"};
const setParams = (url, params) => Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
const createUrl = (baseUrl, params) => {
    const url = new URL(baseUrl);
    setParams(url, params);
    return url;
};
const createOutboundUrl = ({ handoverUrl, targetUrl, }) => {
    const nextUrl = createUrl(handoverUrl, {
        [paramKeys.STAGE]: stages.OS_OUTBOUND,
        [paramKeys.R]: targetUrl,
    });
    return nextUrl.toString();
};

export { createOutboundUrl };
//# sourceMappingURL=index.js.map
