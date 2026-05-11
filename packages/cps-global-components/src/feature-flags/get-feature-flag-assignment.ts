import { Config, FeatureFlagUsers } from "cps-global-configuration";
import { State, StoredState } from "../store/store";
import { assignBuckets } from "./assign-buckets";

type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U | undefined ? K : never;
}[keyof T] &
  string;

type FeatureFlagUsersKeys = KeysOfType<Config, FeatureFlagUsers>;

// `result` answers the broad "should I show this?" question for every flag,
// with or without variants. `variant` is set only when variants are configured
// AND the user landed on a non-control bucket — purely a discriminator for
// callers with multiple arms.
export type FeatureFlagAssignment = { result: false } | { result: true; variant?: string };

// FCT2-16418 - it is good enough for us to have received an auth object from
// the handover in cases where we haven't been able to directly establish auth.
const resolveAuth = ({ auth, authHint }: Pick<StoredState, "auth" | "authHint">) => auth || (authHint?.found && authHint.result.authResult) || undefined;

// All four config fields are independent OR conditions. Any one being satisfied
// puts the user "in"; variants additionally tag the result so analytics can
// differentiate arms.
export const getFeatureFlagAssignment = (
  { auth, authHint, config }: Pick<State, "config"> & Pick<StoredState, "auth" | "authHint">,
  featureFlagKey: FeatureFlagUsersKeys,
): FeatureFlagAssignment => {
  const featureFlagUsers = config[featureFlagKey];
  if (!featureFlagUsers) {
    return { result: false };
  }

  const resolvedAuth = resolveAuth({ auth, authHint });

  // Variant is computed independently — it produces a tag whenever the bucket
  // lands on a non-control share AND we have an objectId to bucket on. The tag
  // is reported regardless of which other inclusion path applies.
  let variant: string | undefined;
  if (featureFlagUsers.variants && Object.keys(featureFlagUsers.variants).length > 0 && resolvedAuth?.isAuthed) {
    const bucketed = assignBuckets({
      subjectId: resolvedAuth.objectId,
      salt: featureFlagUsers.variantSalt ?? featureFlagKey,
      variants: featureFlagUsers.variants,
    });
    if (bucketed !== "control") {
      variant = bucketed;
    }
  }

  const inByGA = !!featureFlagUsers.generallyAvailable;
  const inByGroup = !!resolvedAuth?.isAuthed && !!featureFlagUsers.adGroupIds?.some(g => resolvedAuth.groups.includes(g));
  const inByAdHoc = !!resolvedAuth?.isAuthed && !!featureFlagUsers.adHocUserObjectIds?.includes(resolvedAuth.objectId);
  const inByVariant = !!variant;

  if (inByGA || inByGroup || inByAdHoc || inByVariant) {
    return variant ? { result: true, variant } : { result: true };
  }
  return { result: false };
};
