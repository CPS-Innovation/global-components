import { FoundContext } from "../context/FoundContext";

export type DomMutationObserver = ({ context }: { context: FoundContext }) => {
  isActiveForContext: boolean;
  subscriptions: {
    cssSelector: string;
    handler: (element: Element) => void;
    unbind?: () => void;
  }[];
};
