import { fetchState } from "cps-global-configuration";
import { SettingsSchema } from "cps-global-configuration";

export const initialiseSettings = ({ rootUrl }: { rootUrl: string }) => fetchState({ rootUrl, url: "../state/settings", schema: SettingsSchema });
