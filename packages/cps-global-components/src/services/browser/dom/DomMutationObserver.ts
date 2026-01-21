import { Preview, Settings } from "cps-global-configuration";
import { MergeTags, Register } from "../../../store/store";
import { Result } from "../../../utils/Result";
import { FoundContext } from "../../context/FoundContext";

export type DomMutationObserver = ({
  context,
  register,
  mergeTags,
  window,
  preview,
  settings,
}: {
  context: FoundContext;
  register: Register;
  mergeTags: MergeTags;
  window: Window;
  preview: Result<Preview>;
  settings: Result<Settings>;
}) => {
  isActiveForContext: boolean;
  subscriptions: {
    cssSelector: string;
    // Return true if the handler subscription has done its work
    //  and can be disposed.
    handler: (element: Element) => void | boolean;
  }[];
};
