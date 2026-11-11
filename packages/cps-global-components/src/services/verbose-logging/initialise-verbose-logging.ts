import { Preview } from "cps-global-configuration";
import { Result } from "../../utils/Result";
import { setVerboseLogging } from "../../logging/verbose-logging";

// Is the bundle (not the host page) served from a local origin? That is the
// signature of someone working on global-components itself; a host-app
// developer on localhost loads the deployed dev script.
export const isLocalBundle = (rootUrl: string) => {
  try {
    const { protocol, hostname } = new URL(rootUrl);
    return (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1")) || hostname.endsWith("devtunnels.ms");
  } catch {
    return false;
  }
};

export const initialiseVerboseLogging = ({ rootUrl }: { rootUrl: string }) => {
  if (isLocalBundle(rootUrl)) {
    setVerboseLogging(true);
  }

  const resolveVerboseLoggingFromPreview = (preview: Result<Preview>) => {
    setVerboseLogging(!!(preview.found && preview.result.verboseLogging));
  };

  return { resolveVerboseLoggingFromPreview };
};
