import { CmsSessionHintSchema } from "./CmsSessionHint";
import { fetchState } from "../fetch-state";

export const initialiseCmsSessionHint = ({ rootUrl }: { rootUrl: string }) => fetchState({ rootUrl, url: "../cms-session-hint", schema: CmsSessionHintSchema });
