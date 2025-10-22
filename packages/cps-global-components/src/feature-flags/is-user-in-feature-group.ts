import { Config } from "cps-global-configuration";
import { FeatureFlagUsers } from "cps-global-configuration/dist/schema";
import { State } from "../store/store";

type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U | undefined ? K : never;
}[keyof T] &
  string; // Add & string to exclude undefined

type FeatureFlagUsersKeys = KeysOfType<Config, FeatureFlagUsers>;

export const isUserInFeatureGroup = ({ auth, config }: Pick<State, "config" | "auth">, featureFlagKey: FeatureFlagUsersKeys) => {
  const featureFlagUsers = config[featureFlagKey];

  if (!featureFlagUsers) {
    // The flag is not specified in config so this feature is not operational
    return false;
  }

  if (!auth.isAuthed) {
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
