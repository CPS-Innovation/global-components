import { fetchState } from "../fetch-state";
import { PreviewSchema } from "cps-global-configuration";

export const initialisePreview = ({ rootUrl }: { rootUrl: string }) => fetchState({ rootUrl, url: "../state/preview", schema: PreviewSchema });
