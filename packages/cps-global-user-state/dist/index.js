const IFRAME_ID = "cps-global-components-state";
let stateUrl;
const sendToStorageDomain = (action, key, value) => {
    return new Promise((resolve, reject) => {
        const requestId = Date.now() + Math.random();
        const message = { action, key, value, requestId };
        const responseHandler = ({ data, origin, }) => {
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
        document.getElementById(IFRAME_ID).contentWindow?.postMessage(message, stateUrl);
    });
};
export const initialiseUserState = (iframeUrl) => {
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
export const storeUserState = (key, value) => sendToStorageDomain("store", key, value);
export const retrieveUserState = async (key) => (await sendToStorageDomain("retrieve", key)).value;
