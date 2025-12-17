import { Config, FeatureFlagUsers } from "cps-global-configuration";
import { State } from "../store/store";

type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U | undefined ? K : never;
}[keyof T] &
  string; // Add & string to exclude undefined

type FeatureFlagUsersKeys = KeysOfType<Config, FeatureFlagUsers>;

export const isUserInFeatureGroup = ({ auth, config }: { config: State["config"]; auth: State["auth"] | undefined }, featureFlagKey: FeatureFlagUsersKeys) => {
  const featureFlagUsers = config[featureFlagKey];

  if (!featureFlagUsers) {
    // The flag is not specified in config so this feature is not operational
    return false;
  }

  if (featureFlagUsers.generallyAvailable) {
    // This feature is generally available in this environment
    return true;
  }

  if (!auth || !auth.isAuthed) {
    // We do not know the user so cannot apply the check
    return false;
  }

  return !!(
    // the user is in the ad group
    (
      (featureFlagUsers.adGroupIds && featureFlagUsers.adGroupIds.some(featureGroup => auth.groups.includes(featureGroup))) ||
      // the user is listed as an ad-hoc user
      (featureFlagUsers.adHocUserObjectIds && featureFlagUsers.adHocUserObjectIds.includes(auth.objectId))
    )
  );
};
