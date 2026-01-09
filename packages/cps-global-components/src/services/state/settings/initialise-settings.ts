import { fetchState } from "../fetch-state";
import { SettingsSchema } from "cps-global-configuration";

export const initialiseSettings = ({ rootUrl }: { rootUrl: string }) => fetchState({ rootUrl, url: "../state/settings", schema: SettingsSchema });
