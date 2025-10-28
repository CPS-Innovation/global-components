import { FEATURE_FLAGS } from "./feature-flags";
import { KnownState } from "../store/store";

describe("FEATURE_FLAGS", () => {
  describe("shouldEnableAccessibilityMode", () => {
    it("should return true when isOverrideMode is true", () => {
      const state: Pick<KnownState, "flags"> = {
        flags: { isOverrideMode: true, isOutSystems: false, isE2eTestMode: false, isLocalDevelopment: false },
      };

      const result = FEATURE_FLAGS.shouldEnableAccessibilityMode(state);
      expect(result).toBe(true);
    });

    it("should return false when isOverrideMode is false", () => {
      const state: Pick<KnownState, "flags"> = {
        flags: { isOverrideMode: false, isOutSystems: false, isE2eTestMode: false, isLocalDevelopment: false },
      };

      const result = FEATURE_FLAGS.shouldEnableAccessibilityMode(state);
      expect(result).toBe(false);
    });
  });

  describe("shouldShowGovUkRebrand", () => {
    it("should return true when SHOW_GOVUK_REBRAND is truthy", () => {
      const state: Pick<KnownState, "config"> = {
        config: { SHOW_GOVUK_REBRAND: true } as any,
      };

      const result = FEATURE_FLAGS.shouldShowGovUkRebrand(state);
      expect(result).toBe(true);
    });

    it("should return false when SHOW_GOVUK_REBRAND is false", () => {
      const state: Pick<KnownState, "config"> = {
        config: { SHOW_GOVUK_REBRAND: false } as any,
      };

      const result = FEATURE_FLAGS.shouldShowGovUkRebrand(state);
      expect(result).toBe(false);
    });

    it("should return false when SHOW_GOVUK_REBRAND is undefined", () => {
      const state: Pick<KnownState, "config"> = {
        config: {} as any,
      };

      const result = FEATURE_FLAGS.shouldShowGovUkRebrand(state);
      expect(result).toBe(false);
    });
  });

  describe("shouldShowMenu", () => {
    it("should return true when context is not found but user meets feature flag criteria", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: false },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should return false when showMenuOverride is 'never-show-menu'", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true, showMenuOverride: "never-show-menu" } as any,
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return true when showMenuOverride is 'always-show-menu'", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: false, FEATURE_FLAG_MENU_USERS: { adGroupIds: [] } } as any,
        auth: { isAuthed: false, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true, showMenuOverride: "always-show-menu" } as any,
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should return true when all standard conditions are met", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group", "other-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should return false when SHOW_MENU is false", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: false, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return false when FEATURE_FLAG_MENU_USERS is not set", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: true } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return false when user is not authenticated", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: false, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return false when user is not in the required group", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["other-group", "another-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return false when user has no groups", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return true when user is in one of multiple groups including the required group", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["user-group", "admin-group", "editor-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should prioritize 'never-show-menu' override over 'always-show-menu' when testing order", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true, showMenuOverride: "never-show-menu" } as any,
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return true with 'always-show-menu' override even when standard conditions are not met", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: false, FEATURE_FLAG_MENU_USERS: { adGroupIds: [] } } as any,
        auth: { isAuthed: false, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true, showMenuOverride: "always-show-menu" } as any,
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should return true when user is in adHocUsers list", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adHocUserObjectIds: ["test-object-id"] } } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should return true when user is either in adHocUsers or in adGroupIds", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"], adHocUserObjectIds: ["special-object-id"] } } as any,
        auth: { isAuthed: true, groups: [], username: "specialuser", objectId: "special-object-id" } as any,
        context: { found: true } as any,
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should return false when FEATURE_FLAG_MENU_USERS has empty arrays", () => {
      const state: Pick<KnownState, "config" | "auth" | "context"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: [], adHocUserObjectIds: [] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });
  });

  describe("surveyLink", () => {
    it("should return showLink true and url when SURVEY_LINK is set", () => {
      const state: Pick<KnownState, "config"> = {
        config: { SURVEY_LINK: "https://example.com/survey" } as any,
      };

      const result = FEATURE_FLAGS.surveyLink(state);
      expect(result).toEqual({
        showLink: true,
        url: "https://example.com/survey",
      });
    });

    it("should return showLink false and url undefined when SURVEY_LINK is not set", () => {
      const state: Pick<KnownState, "config"> = {
        config: {} as any,
      };

      const result = FEATURE_FLAGS.surveyLink(state);
      expect(result).toEqual({
        showLink: false,
        url: undefined,
      });
    });

    it("should return showLink false and url empty string when SURVEY_LINK is empty string", () => {
      const state: Pick<KnownState, "config"> = {
        config: { SURVEY_LINK: "" } as any,
      };

      const result = FEATURE_FLAGS.surveyLink(state);
      expect(result).toEqual({
        showLink: false,
        url: "",
      });
    });

    it("should return showLink true and url when SURVEY_LINK is a non-empty string", () => {
      const state: Pick<KnownState, "config"> = {
        config: { SURVEY_LINK: "https://feedback.gov.uk" } as any,
      };

      const result = FEATURE_FLAGS.surveyLink(state);
      expect(result).toEqual({
        showLink: true,
        url: "https://feedback.gov.uk",
      });
    });
  });
});
