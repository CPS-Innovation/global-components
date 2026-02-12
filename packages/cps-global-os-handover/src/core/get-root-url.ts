const rootUrl =
  document.currentScript instanceof HTMLScriptElement
    ? document.currentScript.src
    : null;

export const getRootUrl = () => rootUrl;
