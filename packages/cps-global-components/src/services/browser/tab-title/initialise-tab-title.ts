import { Preview } from "cps-global-configuration";
import { Result } from "../../../utils/Result";
import { Subscribe } from "../../../store/store";
import { SubscriptionFactory } from "../../../store/subscriptions/SubscriptionFactory";
import { Tags } from "../../context/Tags";

const URN_SEPARATOR = " \u2013 ";

export const buildTitle = (baseTitle: string, urn: string | undefined): string =>
  urn ? (baseTitle ? urn + URN_SEPARATOR + baseTitle : urn) : baseTitle;

export const initialiseTabTitle = ({ document, preview, subscribe }: { document: Document; preview: Result<Preview>; subscribe: Subscribe }) => {
  const isEnabled = () => !!preview.result?.tabTitleUrn;

  let currentUrn: string | undefined;
  let settingTitle = false;

  const getBaseTitle = () => {
    const raw = document.title;
    if (!currentUrn) return raw;
    if (raw === currentUrn) return "";
    const prefix = currentUrn + URN_SEPARATOR;
    if (raw.startsWith(prefix)) return raw.slice(prefix.length);
    return raw;
  };

  const setTitle = (desired: string) => {
    if (document.title === desired) return;
    settingTitle = true;
    document.title = desired;
    settingTitle = false;
  };

  const applyUrn = () => {
    const urn = isEnabled() ? currentUrn : undefined;
    setTitle(buildTitle(getBaseTitle(), urn));
  };

  const onTagsChange = (tags: Tags | undefined) => {
    const nextUrn = tags?.urn;
    if (nextUrn === currentUrn) return;

    const baseTitle = getBaseTitle();
    currentUrn = nextUrn;

    const urn = isEnabled() ? currentUrn : undefined;
    setTitle(buildTitle(baseTitle, urn));
  };

  // Watch for the host app changing document.title after us.
  // Observe <head> with subtree so we catch both <title> being created
  // and its text content changing.
  if (document.head) {
    new MutationObserver(() => {
      if (settingTitle) return;
      applyUrn();
    }).observe(document.head, { childList: true, subtree: true, characterData: true });
  }

  const factory: SubscriptionFactory = () => ({
    type: "onChange",
    handler: {
      propName: "tags",
      handler: onTagsChange,
    },
  });

  subscribe(factory);
};
