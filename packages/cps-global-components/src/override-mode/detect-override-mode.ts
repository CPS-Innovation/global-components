//const overrideUserMarkers = ["4faa102c-47fb-4631-80e8-6038d46de0b0", "UID=104007;", "CMSUSER104007="];

import { OVERRIDE_KEY, OVERRIDE_VALUE } from "./constants";

export const detectOverrideMode = () => localStorage.getItem(OVERRIDE_KEY) === OVERRIDE_VALUE;//Object.values(localStorage).some(value => value && overrideUserMarkers.some(indicator => value.includes(indicator)));
