import { Config } from "cps-global-configuration";
import { FoundContext } from "../context/FoundContext";
import { FEATURE_FLAGS } from "../../feature-flags/feature-flags";
import { State, StoredState } from "../../store/store";

const LOCALSTORAGE_KEY = "$OS_Users$Casework_Blocks$ClientVars$ShowAlert";
const EVENT_NAME = "cps-global-show-alert";

export const initialiseOutSystemsShowAlert = ({
  config,
  authHint,
  preview,
}: {
  config: Config;
  authHint: StoredState["authHint"];
  preview: State["preview"];
}) => {
  const initialiseOutSystemsShowAlertForContext = ({ context, auth }: { context: FoundContext; auth: StoredState["auth"] }) => {
    if (!context.found || !context.showNotification) return;

    const showAlert = FEATURE_FLAGS.shouldShowHomePageNotification({ config, auth, authHint, preview });
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(showAlert));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { showAlert } }));
  };

  return { initialiseOutSystemsShowAlertForContext };
};
