import { DomMutationObserver } from "./DomMutationSubscriber";

export const domTagMutationSubscriber: DomMutationObserver = ({ context }) => ({
  isActiveForContext: !!context.domTags?.length,
  subscriptions: context.domTags!.map(({ cssSelector, regex }) => ({
    cssSelector,
    handler: () => {},
  })),
});
