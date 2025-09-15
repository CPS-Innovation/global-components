import { State, SubscriptionFactory } from "../store";
import { _console } from "../../logging/_console";
import { caseIdentifierKeys } from "../../services/context/CaseIdentifiers";
import { ObservableMap } from "@stencil/store";

// todo: unit test for not setting if the context does not require it
const transposeIdentifiers = ({ state }: ObservableMap<State>, tags: Record<string, string>) =>
  caseIdentifierKeys.forEach(key => {
    if (tags[key]) {
      state.caseIdentifiers = { ...state.caseIdentifiers, ...{ [key]: tags[key] } };
    }
  });

export const caseIdentifiersSubscription: SubscriptionFactory = ({ store }) => ({
  set: (key, newValue) => {
    if (key === "tags" && newValue) {
      const domTags = newValue as State["tags"];
      if (domTags) {
        transposeIdentifiers(store, domTags);
      }
    } else if (key === "context") {
      const context = newValue as State["context"];
      if (context?.found) {
        transposeIdentifiers(store, context.tags);
      }
    }
  },
});
