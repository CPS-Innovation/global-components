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

  const getBaseTitle = () => {
    const raw = document.title;
    if (!currentUrn) return raw;
    if (raw === currentUrn) return "";
    const prefix = currentUrn + URN_SEPARATOR;
    if (raw.startsWith(prefix)) return raw.slice(prefix.length);
    return raw;
  };

  const onTagsChange = (tags: Tags | undefined) => {
    const nextUrn = tags?.urn;
    if (nextUrn === currentUrn) return;

    const baseTitle = getBaseTitle();
    currentUrn = nextUrn;

    const urn = isEnabled() ? currentUrn : undefined;
    const desired = buildTitle(baseTitle, urn);
    if (document.title !== desired) document.title = desired;
  };

  const factory: SubscriptionFactory = () => ({
    type: "onChange",
    handler: {
      propName: "tags",
      handler: onTagsChange,
    },
  });

  subscribe(factory);
};
