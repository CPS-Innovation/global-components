import { PrivateTagProperties, privateTagProperties } from "../store";
import { SubscriptionFactory } from "./SubscriptionFactory";

export const tagsSubscriptionFactory: SubscriptionFactory = ({ get, set }) => ({
  subscription: {
    set: key => {
      if (privateTagProperties.includes(key as PrivateTagProperties)) {
        // Order is important here. Our logic is: if a tag is found in domTags then it
        //  overrides a tag found in the path (domTags would generally arrive later than pathTags)
        //  and we use domTags to get better information than available in the path.
        //  Prop tags should override everything as they are actively supplied by the host.
        set("tags", {
          ...get("pathTags"),
          ...get("domTags"),
          ...get("propTags"),
        });
      }
    },
  },
});
