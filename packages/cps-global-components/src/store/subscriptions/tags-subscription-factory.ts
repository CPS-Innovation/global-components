import { PrivateTagProperties, privateTagProperties } from "../store";
import { SubscriptionFactory } from "./SubscriptionFactory";

export const tagsSubscriptionFactory: SubscriptionFactory = ({ get, set }) => ({
  set: key => {
    if (privateTagProperties.includes(key as PrivateTagProperties)) {
      // Note 1: Order is important here. Our logic is: if a tag is found in domTags then it
      //  overrides a tag found in the path (domTags would generally arrive later than pathTags)
      //  and we use domTags to get better information than available in the path.
      //  Prop tags should override everything as they are actively supplied by the host.
      // Note 2: a design decision. Lets say that "tags" is never undefined.  DomTags for instance
      //  may come in at any time post-initialisation as the DOM changes, so there is always
      //  going to be an element of laziness to tags.  The calling code should work with the fact
      //  that tags will be defined from the start is expected to be populated at any time from
      //  initialisation onwards.
      set("tags", {
        ...get("pathTags"),
        ...get("domTags"),
        ...get("propTags"),
      });
    }
  },
});
