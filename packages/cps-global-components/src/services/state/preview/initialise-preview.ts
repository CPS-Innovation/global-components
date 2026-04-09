import { fetchState } from "../fetch-state";
import { Preview, PreviewSchema } from "cps-global-configuration";
import { Result } from "../../../utils/Result";

type Register = (arg: { preview: Result<Preview> }) => void;

export const initialisePreview = async ({ rootUrl, register }: { rootUrl: string; register: Register }): Promise<Result<Preview>> => {
  const preview = await fetchState({ rootUrl, url: "../state/preview", schema: PreviewSchema });
  register({ preview });
  return preview;
};
