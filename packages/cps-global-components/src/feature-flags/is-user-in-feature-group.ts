import { Config, FeatureFlagUsers } from "cps-global-configuration";
import { State, StoredState } from "../store/store";

type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U | undefined ? K : never;
}[keyof T] &
  string; // Add & string to exclude undefined

type FeatureFlagUsersKeys = KeysOfType<Config, FeatureFlagUsers>;

// FCT2-16418 - it is good enough for us to have received an auth object from the handover in cases where we haven't been able to directly establish auth
const resolveAuth = ({ auth, authHint }: Pick<StoredState, "auth" | "authHint">) => auth || (authHint?.found && authHint.result.authResult) || undefined;

export const isUserInFeatureGroup = ({ auth, authHint, config }: Pick<State, "config"> & Pick<StoredState, "auth" | "authHint">, featureFlagKey: FeatureFlagUsersKeys) => {
  // FCT2-16418 - it is good enough for us to have received an auth object from the handover in cases where we haven't been able to directly establish auth

  const featureFlagUsers = config[featureFlagKey];

  if (!featureFlagUsers) {
    // The flag is not specified in config so this feature is not operational
    return false;
  }

  if (featureFlagUsers.generallyAvailable) {
    // This feature is generally available in this environment
    return true;
  }

  const resolvedAuth = resolveAuth({ auth, authHint });

  if (!resolvedAuth || !resolvedAuth.isAuthed) {
    // We do not know the user so cannot apply the check
    return false;
  }

  return !!(
    // the user is in the ad group
    (
      (featureFlagUsers.adGroupIds && featureFlagUsers.adGroupIds.some(featureGroup => resolvedAuth.groups.includes(featureGroup))) ||
      // the user is listed as an ad-hoc user
      (featureFlagUsers.adHocUserObjectIds && featureFlagUsers.adHocUserObjectIds.includes(resolvedAuth.objectId))
    )
  );
};
