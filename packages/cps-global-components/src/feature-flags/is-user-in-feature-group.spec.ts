import { isUserInFeatureGroup } from "./is-user-in-feature-group";
import { State, StoredState } from "../store/store";

type IsUserInFeatureGroupState = Pick<State, "config"> & Pick<StoredState, "auth" | "authHint">;

describe("isUserInFeatureGroup", () => {
  describe("when feature flag is not configured", () => {
    it("should return false when featureFlagUsers is undefined", () => {
      const state: IsUserInFeatureGroupState = {
        config: {} as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when featureFlagUsers is null", () => {
      const state: IsUserInFeatureGroupState = {
        config: { FEATURE_FLAG_MENU_USERS: null } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });
  });

  describe("when user is not authenticated", () => {
    it("should return false when isAuthed is false, even if user has groups", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
          },
        } as any,
        auth: { isAuthed: false, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when isAuthed is false and user is in adHocUsers list", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: ["test-object-id"],
          },
        } as any,
        auth: { isAuthed: false, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });
  });

  describe("when checking AD group membership", () => {
    it("should return true when user is in one of the configured AD groups", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group", "editor-group"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return true when user is in at least one of multiple configured AD groups", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group", "editor-group", "viewer-group"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["user-group", "editor-group", "other-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return false when user is not in any of the configured AD groups", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group", "editor-group"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["user-group", "viewer-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when user has no groups but adGroupIds is configured", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when adGroupIds is an empty array", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: [],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when adGroupIds is undefined", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: [],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });
  });

  describe("when checking ad-hoc user membership", () => {
    it("should return true when user is in the adHocUsers list", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: ["test-object-id", "another-object-id"],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return false when user is not in the adHocUsers list", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: ["different-object-id", "another-object-id"],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when adHocUsers is an empty array", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: [],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when adHocUsers is undefined", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: [],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });
  });

  describe("when both AD groups and ad-hoc users are configured", () => {
    it("should return true when user is in AD group but not in adHocUsers", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
            adHocUserObjectIds: ["different-object-id"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return true when user is in adHocUsers but not in AD group", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
            adHocUserObjectIds: ["test-object-id"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["user-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return true when user is in both AD group and adHocUsers", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
            adHocUserObjectIds: ["test-object-id"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return false when user is in neither AD group nor adHocUsers", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
            adHocUserObjectIds: ["different-object-id"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["user-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when both adGroupIds and adHocUsers are empty arrays", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: [],
            adHocUserObjectIds: [],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });
  });

  describe("when feature is generally available", () => {
    it("should return true when generallyAvailable is true and user is authenticated", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            generallyAvailable: true,
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return true when generallyAvailable is true and user is not authenticated", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            generallyAvailable: true,
          },
        } as any,
        auth: { isAuthed: false, groups: [], username: "", objectId: "" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return true when generallyAvailable is true even if user is not in AD groups", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            generallyAvailable: true,
            adGroupIds: ["admin-group"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["user-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return true when generallyAvailable is true even if user is not in adHocUsers list", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            generallyAvailable: true,
            adHocUserObjectIds: ["different-object-id"],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should check other criteria when generallyAvailable is false", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            generallyAvailable: false,
            adGroupIds: ["admin-group"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return false when generallyAvailable is false and user does not meet other criteria", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            generallyAvailable: false,
            adGroupIds: ["admin-group"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["user-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return true when generallyAvailable is true with both AD groups and adHocUsers configured", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            generallyAvailable: true,
            adGroupIds: ["admin-group"],
            adHocUserObjectIds: ["different-object-id"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["user-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle case-sensitive objectId matching", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: ["TestObjectId"],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "testobjectid" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should handle case-sensitive group matching", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["Admin-Group"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should handle objectId with special characters", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: ["object-id-123-abc"],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "test.user@example.com", objectId: "object-id-123-abc" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should handle group names with special characters", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group-2024"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group-2024", "user-group"], username: "testuser", objectId: "test-object-id" } as any,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });
  });

  describe("when falling back to authHint (FCT2-16418)", () => {
    it("should return true when auth is undefined but authHint has a user in the AD group", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
          },
        } as any,
        auth: undefined,
        authHint: { found: true, result: { authResult: { isAuthed: true, groups: ["admin-group"], username: "hintuser", objectId: "hint-object-id" }, timestamp: 1 } },
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return true when auth is undefined but authHint has a user in adHocUsers", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: ["hint-object-id"],
          },
        } as any,
        auth: undefined,
        authHint: { found: true, result: { authResult: { isAuthed: true, groups: [], username: "hintuser", objectId: "hint-object-id" }, timestamp: 1 } },
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return false when auth is undefined and authHint is not found", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
          },
        } as any,
        auth: undefined,
        authHint: { found: false, error: new Error("not found") },
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when both auth and authHint are undefined", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
          },
        } as any,
        auth: undefined,
        authHint: undefined,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should prefer auth over authHint when both are available", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["auth-group"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["auth-group"], username: "authuser", objectId: "auth-object-id" } as any,
        authHint: { found: true, result: { authResult: { isAuthed: true, groups: ["hint-group"], username: "hintuser", objectId: "hint-object-id" }, timestamp: 1 } },
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should not use authHint when auth is present but user is not in group", () => {
      const state: IsUserInFeatureGroupState = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["hint-group"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["other-group"], username: "authuser", objectId: "auth-object-id" } as any,
        authHint: { found: true, result: { authResult: { isAuthed: true, groups: ["hint-group"], username: "hintuser", objectId: "hint-object-id" }, timestamp: 1 } },
      };

      // auth takes precedence even though authHint would match
      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });
  });
});
