import { ApplicationFlags, AuthHint, Config, FoundContext, Preview, Settings } from "cps-global-configuration";
import { MergeTags, Register } from "../../../store/store";
import { Result } from "../../../utils/Result";

export type DomMutationObserver = ({
  context,
  register,
  mergeTags,
  window,
  preview,
  settings,
  flags,
  config,
  authHint,
}: {
  context: FoundContext;
  register: Register;
  mergeTags: MergeTags;
  window: Window;
  preview: Result<Preview>;
  settings: Result<Settings>;
  flags: ApplicationFlags;
  config: Config;
  // Last-known identity, resolved before DOM observation is wired. Live `auth` is
  // deliberately absent: subscribers are bound before the auth promise starts
  // (see global-script), so anything identity-driven here reads the hint.
  authHint: Result<AuthHint>;
}) => {
  isActiveForContext: boolean;
  subscriptions: {
    cssSelector: string;
    // Return true if the handler subscription has done its work
    //  and can be disposed.
    handler: (element: Element) => void | boolean;
  }[];
};
