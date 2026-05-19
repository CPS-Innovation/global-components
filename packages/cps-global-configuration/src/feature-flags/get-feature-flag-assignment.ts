import type { AuthHint } from "../AuthHint";
import type { AuthResult } from "../AuthResult";
import type { Config, FeatureFlagUsers } from "../Config";
import type { Result } from "../Result";
import { assignBuckets } from "./assign-buckets";

// Keys on Config whose value type is FeatureFlagUsers.
type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U | undefined ? K : never;
}[keyof T] &
  string;

export type FeatureFlagUsersKeys = KeysOfType<Config, FeatureFlagUsers>;

// `result` answers the broad "should I show this?" question for every flag,
// with or without variants. `variant` is set only when variants are configured
// AND the user landed on a non-control bucket — purely a discriminator for
// callers with multiple arms.
export type FeatureFlagAssignment =
  | { result: false }
  | { result: true; variant?: string };

// The minimum a caller needs to supply: a config, plus whatever identity
// signal they have. `auth` is the freshly-resolved AD identity (if any);
// `authHint` is the persisted last-known identity, used as a fallback.
// Either can be undefined — the host bundle has both; the handover bundle
// typically has only authHint at the point it asks (chicken-and-egg with auth).
export type FeatureFlagInputs = {
  config: Config;
  auth?: AuthResult;
  authHint?: Result<AuthHint>;
};

// FCT2-16418 — it is good enough for us to have received an auth object from
// the handover in cases where we haven't been able to directly establish auth.
const resolveAuth = ({ auth, authHint }: Pick<FeatureFlagInputs, "auth" | "authHint">) =>
  auth || (authHint?.found && authHint.result.authResult) || undefined;

// All four config fields are independent OR conditions. Any one being satisfied
// puts the user "in"; variants additionally tag the result so analytics can
// differentiate arms.
export const getFeatureFlagAssignment = (
  { auth, authHint, config }: FeatureFlagInputs,
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
