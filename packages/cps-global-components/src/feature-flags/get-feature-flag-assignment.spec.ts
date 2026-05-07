import { getFeatureFlagAssignment } from "./get-feature-flag-assignment";
import { State, StoredState } from "../store/store";

type AssignmentState = Pick<State, "config"> & Pick<StoredState, "auth" | "authHint">;

const out = { result: false };
const inNoVariant = { result: true };

describe("getFeatureFlagAssignment", () => {
  describe("when feature flag is not configured", () => {
    it("returns 'out' when featureFlagUsers is undefined", () => {
      const state: AssignmentState = {
        config: {} as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(out);
    });

    it("returns 'out' when featureFlagUsers is null", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: null } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(out);
    });
  });

  describe("when user is not authenticated", () => {
    it("returns 'out' when isAuthed is false, even if user has groups", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: false, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(out);
    });

    it("returns 'out' when isAuthed is false and user is in adHocUsers list", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adHocUserObjectIds: ["test-object-id"] } } as any,
        auth: { isAuthed: false, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(out);
    });
  });

  describe("AD group eligibility", () => {
    it("returns 'in' when user is in one of the configured AD groups", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group", "editor-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(inNoVariant);
    });

    it("returns 'out' when user is not in any of the configured AD groups", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group", "editor-group"] } } as any,
        auth: { isAuthed: true, groups: ["user-group", "viewer-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(out);
    });

    it("returns 'out' when adGroupIds is an empty array", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adGroupIds: [] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(out);
    });
  });

  describe("ad-hoc user eligibility", () => {
    it("returns 'in' when user is in the adHocUsers list", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adHocUserObjectIds: ["test-object-id", "another-object-id"] } } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(inNoVariant);
    });

    it("returns 'out' when user is not in the adHocUsers list", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adHocUserObjectIds: ["different-object-id"] } } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(out);
    });
  });

  describe("generallyAvailable", () => {
    it("returns 'in' when generallyAvailable is true and user is authenticated", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { generallyAvailable: true } } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(inNoVariant);
    });

    it("returns 'in' when generallyAvailable is true and user is not authenticated", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { generallyAvailable: true } } as any,
        auth: { isAuthed: false, groups: [], username: "", objectId: "" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(inNoVariant);
    });

    it("returns 'in' when generallyAvailable is true even if user is not in AD groups", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { generallyAvailable: true, adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["user-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(inNoVariant);
    });

    it("falls back to other criteria when generallyAvailable is false", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { generallyAvailable: false, adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(inNoVariant);
    });
  });

  describe("authHint fallback (FCT2-16418)", () => {
    it("uses authHint when auth is undefined and the hint puts the user in an AD group", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: undefined,
        authHint: { found: true, result: { authResult: { isAuthed: true, groups: ["admin-group"], username: "hintuser", objectId: "hint-object-id" }, timestamp: 1 } },
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(inNoVariant);
    });

    it("returns 'out' when both auth and authHint are unavailable", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: undefined,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(out);
    });

    it("prefers auth over authHint when both are present", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adGroupIds: ["auth-group"] } } as any,
        auth: { isAuthed: true, groups: ["auth-group"], username: "authuser", objectId: "auth-object-id" } as any,
        authHint: { found: true, result: { authResult: { isAuthed: true, groups: ["hint-group"], username: "hintuser", objectId: "hint-object-id" }, timestamp: 1 } },
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(inNoVariant);
    });
  });

  describe("variants — independent inclusion path", () => {
    const subject = { isAuthed: true, groups: ["rollout-group"], username: "u", objectId: "subject-fixed" };

    it("puts a user 'in' via variants alone, even when no group/list/GA configured", () => {
      // 100% to a single variant — every authed user gets it via the variant path.
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { variants: { treatment: 100 } } } as any,
        auth: subject as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual({ result: true, variant: "treatment" });
    });

    it("returns 'out' when the variant lands on the implicit control share and no other inclusion path applies", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { variants: { treatment: 0 } } } as any,
        auth: subject as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(out);
    });

    it("OR's the variant path with adGroupIds — group members are always in, plus any non-control bucket", () => {
      // 0% on the variant means the bucket lands on control, but the user is
      // still "in" via group membership (no variant tag).
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adGroupIds: ["rollout-group"], variants: { treatment: 0 } } } as any,
        auth: subject as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(inNoVariant);
    });

    it("includes the variant tag when the user is in via group AND the bucket landed on a non-control share", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adGroupIds: ["rollout-group"], variants: { treatment: 100 } } } as any,
        auth: subject as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual({ result: true, variant: "treatment" });
    });

    it("includes a non-group user via variants only", () => {
      // User is NOT in adGroupIds — but the 100% bucket still puts them in via the variant path.
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adGroupIds: ["rollout-group"], variants: { treatment: 100 } } } as any,
        auth: { isAuthed: true, groups: ["other-group"], username: "u", objectId: "subject-fixed" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual({ result: true, variant: "treatment" });
    });

    it("returns 'out' when no inclusion path applies — not in group, variant on control", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adGroupIds: ["rollout-group"], variants: { treatment: 0 } } } as any,
        auth: { isAuthed: true, groups: ["other-group"], username: "u", objectId: "subject-fixed" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(out);
    });

    it("returns 'in' via generallyAvailable for unauthed users — variants are skipped (no objectId to bucket)", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { generallyAvailable: true, variants: { treatment: 100 } } } as any,
        auth: { isAuthed: false, groups: [], username: "", objectId: "" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(inNoVariant);
    });

    it("returns 'in' with variant tag for authed users when both generallyAvailable AND variants apply", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { generallyAvailable: true, variants: { treatment: 100 } } } as any,
        auth: subject as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual({ result: true, variant: "treatment" });
    });

    it("returns 'out' for variants-only when user is unauthed (no objectId to bucket)", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { variants: { treatment: 100 } } } as any,
        auth: { isAuthed: false, groups: [], username: "", objectId: "" } as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(out);
    });

    it("treats an empty variants object as 'no variants' — falls back to other inclusion paths", () => {
      const state: AssignmentState = {
        config: { FEATURE_FLAG_MENU_USERS: { adGroupIds: ["rollout-group"], variants: {} } } as any,
        auth: subject as any,
        authHint: undefined,
      };

      expect(getFeatureFlagAssignment(state, "FEATURE_FLAG_MENU_USERS")).toEqual(inNoVariant);
    });

    it("uses the variantSalt override when provided — different salt swaps a 50/50 user's arm", () => {
      // For a 50/50 split, varying the salt has a high probability of moving
      // any one user to the other arm. Use two salts and assert at least one
      // pair across a sample disagrees.
      const baseConfig = (variantSalt: string) => ({
        FEATURE_FLAG_MENU_USERS: { adGroupIds: ["rollout-group"], variants: { a: 50 }, variantSalt },
      });
      const subjects = Array.from({ length: 50 }, (_, i) => ({ isAuthed: true, groups: ["rollout-group"], username: "u", objectId: `s-${i}` }));
      let differences = 0;
      for (const auth of subjects) {
        const a = getFeatureFlagAssignment({ config: baseConfig("salt-A") as any, auth: auth as any, authHint: undefined }, "FEATURE_FLAG_MENU_USERS");
        const b = getFeatureFlagAssignment({ config: baseConfig("salt-B") as any, auth: auth as any, authHint: undefined }, "FEATURE_FLAG_MENU_USERS");
        if (a.result !== b.result || a.result && b.result && a.variant !== b.variant) {
          differences++;
        }
      }
      expect(differences).toBeGreaterThan(0);
    });
  });
});
