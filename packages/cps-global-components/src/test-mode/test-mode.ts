import fetchJsonp from "fetch-jsonp";

const isTestMode = () => localStorage.getItem("cps-global-components-test-override") === "true";

export const tryGetConfigAsJsonP = async (configUrl: string) => {
  try {
    if (!isTestMode()) {
      return null;
    }
    const response = await fetchJsonp(configUrl.replace(".json", ".js"), { jsonpCallbackFunction: "cps_global_components_config_jsonp_callback" });
    return await response.json();
  } catch (err) {
    console.debug("Error trying jsonp config retrieval", err);
    return null;
  }
};

export const trySetupOutSystemsShim = () => {};
