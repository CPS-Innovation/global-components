const IFRAME_ID = "cps-global-components-state";

let stateUrl: string;

type StorageAction = "store" | "retrieve" | "clear";
type StorageResponse = {
  requestId: number;
  success: boolean;
  message: string;
  value?: string;
};

const sendToStorageDomain = (
  action: StorageAction,
  key: string,
  value?: string
): Promise<StorageResponse> => {
  return new Promise((resolve, reject) => {
    const requestId = Date.now() + Math.random();
    const message = { action, key, value, requestId };

    const responseHandler = ({
      data,
      origin,
    }: MessageEvent<StorageResponse>) => {
      if (!stateUrl.startsWith(origin)) {
        reject({ origin, stateUrl });
      }

      if (data.requestId !== requestId) {
        return;
      }

      if (!data.success) {
        reject(data);
        return;
      }

      window.removeEventListener("message", responseHandler);
      resolve(data);
    };

    window.addEventListener("message", responseHandler);
    (
      document.getElementById(IFRAME_ID) as HTMLIFrameElement
    ).contentWindow?.postMessage(message, stateUrl);
  });
};

export const initialiseUserState = (iframeUrl: string) => {
  stateUrl = iframeUrl;

  return new Promise((resolve, reject) => {
    const iframe = Object.assign(document.createElement("iframe"), {
      src: stateUrl,
      id: IFRAME_ID,
      style: "display:none;",
    });

    iframe.addEventListener("load", resolve);

    // Set up error event listener
    iframe.addEventListener("error", (error) => {
      console.error("Iframe failed to load");
      reject(error);
    });

    document.body.appendChild(iframe);
  });
};

export const storeUserState = (key: string, value: string) =>
  sendToStorageDomain("store", key, value);

export const retrieveUserState = async (key: string) =>
  (await sendToStorageDomain("retrieve", key)).value;
