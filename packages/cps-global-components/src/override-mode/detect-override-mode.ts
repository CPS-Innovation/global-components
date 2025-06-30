const overrideIndicators = ["4faa102c-47fb-4631-80e8-6038d46de0b0", "UID=104007;", "CMSUSER104007="];

export const detectOverrideMode = () => Object.values(localStorage).some(value => value && overrideIndicators.some(indicator => value.includes(indicator)));
