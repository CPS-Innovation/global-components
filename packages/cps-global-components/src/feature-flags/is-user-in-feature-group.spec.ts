import { isUserInFeatureGroup } from "./is-user-in-feature-group";
import { State } from "../store/store";

describe("isUserInFeatureGroup", () => {
  describe("when feature flag is not configured", () => {
    it("should return false when featureFlagUsers is undefined", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {} as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when featureFlagUsers is null", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: { FEATURE_FLAG_MENU_USERS: null } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });
  });

  describe("when user is not authenticated", () => {
    it("should return false when isAuthed is false, even if user has groups", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
          },
        } as any,
        auth: { isAuthed: false, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when isAuthed is false and user is in adHocUsers list", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: ["test-object-id"],
          },
        } as any,
        auth: { isAuthed: false, groups: [], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });
  });

  describe("when checking AD group membership", () => {
    it("should return true when user is in one of the configured AD groups", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group", "editor-group"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return true when user is in at least one of multiple configured AD groups", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group", "editor-group", "viewer-group"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["user-group", "editor-group", "other-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return false when user is not in any of the configured AD groups", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group", "editor-group"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["user-group", "viewer-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when user has no groups but adGroupIds is configured", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when adGroupIds is an empty array", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: [],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when adGroupIds is undefined", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: [],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });
  });

  describe("when checking ad-hoc user membership", () => {
    it("should return true when user is in the adHocUsers list", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: ["test-object-id", "another-object-id"],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return false when user is not in the adHocUsers list", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: ["different-object-id", "another-object-id"],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when adHocUsers is an empty array", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: [],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when adHocUsers is undefined", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: [],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });
  });

  describe("when both AD groups and ad-hoc users are configured", () => {
    it("should return true when user is in AD group but not in adHocUsers", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
            adHocUserObjectIds: ["different-object-id"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return true when user is in adHocUsers but not in AD group", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
            adHocUserObjectIds: ["test-object-id"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["user-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return true when user is in both AD group and adHocUsers", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
            adHocUserObjectIds: ["test-object-id"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should return false when user is in neither AD group nor adHocUsers", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group"],
            adHocUserObjectIds: ["different-object-id"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["user-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should return false when both adGroupIds and adHocUsers are empty arrays", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: [],
            adHocUserObjectIds: [],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle case-sensitive objectId matching", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: ["TestObjectId"],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "testobjectid" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should handle case-sensitive group matching", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["Admin-Group"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(false);
    });

    it("should handle objectId with special characters", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adHocUserObjectIds: ["object-id-123-abc"],
          },
        } as any,
        auth: { isAuthed: true, groups: [], username: "test.user@example.com", objectId: "object-id-123-abc" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });

    it("should handle group names with special characters", () => {
      const state: Pick<State, "config" | "auth"> = {
        config: {
          FEATURE_FLAG_MENU_USERS: {
            adGroupIds: ["admin-group-2024"],
          },
        } as any,
        auth: { isAuthed: true, groups: ["admin-group-2024", "user-group"], username: "testuser", objectId: "test-object-id" } as any,
      };

      const result = isUserInFeatureGroup(state, "FEATURE_FLAG_MENU_USERS");
      expect(result).toBe(true);
    });
  });
});
