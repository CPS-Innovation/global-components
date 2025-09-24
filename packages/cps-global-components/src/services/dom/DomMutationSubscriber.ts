import { FoundContext } from "../context/find-context";

export type DomMutationObserver = ({ context }: { context: FoundContext }) => {
  isActiveForContext: boolean;
  subscriptions: {
    cssSelector: string;
    handler: (element: Element) => void;
    unbind?: () => void;
  }[];
};
