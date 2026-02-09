export const getRootUrl = () => {
  const script = document.currentScript;
  return script && script instanceof HTMLScriptElement ? script.src : null;
};
