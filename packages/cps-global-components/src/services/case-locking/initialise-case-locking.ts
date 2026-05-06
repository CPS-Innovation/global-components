import type { Config } from "cps-global-configuration";
import { getArtifactUrl } from "../../utils/get-artifact-url";

export const initialiseCaseLocking = ({ window, rootUrl, config }: { window: Window; rootUrl: string; config: Config }) => {
  if (!config.CASE_LOCKING_POC_SCRIPT_BLOB_ADDRESS) {
    return;
  }

  const script = window.document.createElement("script");
  script.src = getArtifactUrl(rootUrl, config.CASE_LOCKING_POC_SCRIPT_BLOB_ADDRESS);
  window.document.head.appendChild(script);
};
