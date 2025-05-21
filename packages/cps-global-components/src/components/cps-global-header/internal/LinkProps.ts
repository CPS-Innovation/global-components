import { OnwardLinkDefinition } from "../../../components";

export type LinkProps = {
  label: string;
  href: OnwardLinkDefinition;
  selected?: boolean;
  openInNewTab?: boolean;
};
