import { MergeTags, Register } from "../../../store/store";
import { FoundContext } from "../../context/FoundContext";

export type DomMutationObserver = ({ context, register, mergeTags, window }: { context: FoundContext; register: Register; mergeTags: MergeTags; window: Window }) => {
  isActiveForContext: boolean;
  subscriptions: {
    cssSelector: string;
    // Return true if the handler subscription has done its work
    //  and can be disposed.
    handler: (element: Element) => void | boolean;
  }[];
};
