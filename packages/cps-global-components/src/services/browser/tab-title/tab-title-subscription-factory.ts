import { Preview } from "cps-global-configuration";
import { Result } from "../../../utils/Result";
import { SubscriptionFactory } from "../../../store/subscriptions/SubscriptionFactory";
import { initialiseTabTitle } from "./initialise-tab-title";

export const tabTitleSubscriptionFactory =
  ({ document, preview }: { document: Document; preview: Result<Preview> }): SubscriptionFactory =>
  () => {
    const { onTagsChange } = initialiseTabTitle({
      document,
      isEnabled: () => !!preview.result?.tabTitleUrn,
    });
    return {
      type: "onChange",
      handler: {
        propName: "tags",
        handler: onTagsChange,
      },
    };
  };
