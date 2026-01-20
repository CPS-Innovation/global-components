import { FEATURE_FLAGS } from "./feature-flags";
import { State } from "../store/store";
import { ApplicationFlags } from "../services/application-flags/ApplicationFlags";

describe("FEATURE_FLAGS", () => {
  describe("shouldEnableAccessibilityMode", () => {
    it("should return true when preview accessibility is true", () => {
      const state: Pick<State, "preview" | "flags"> = {
        preview: { found: true, result: { accessibility: true } },
        flags: {} as ApplicationFlags,
      };

      const result = FEATURE_FLAGS.shouldEnableAccessibilityMode(state);
      expect(result).toBe(true);
    });

    it("should return false when preview accessibility is falsy", () => {
      const state: Pick<State, "preview" | "flags"> = {
        preview: { found: true, result: {} },
        flags: {} as ApplicationFlags,
      };

      const result = FEATURE_FLAGS.shouldEnableAccessibilityMode(state);
      expect(result).toBe(false);
    });

    it("should return false when preview is not found", () => {
      const state: Pick<State, "preview" | "flags"> = {
        preview: { found: false, error: {} as Error },
        flags: {} as ApplicationFlags,
      };

      const result = FEATURE_FLAGS.shouldEnableAccessibilityMode(state);
      expect(result).toBe(false);
    });
  });

  describe("shouldShowGovUkRebrand", () => {
    it("should return 'gds' when preview newHeader is 'gds'", () => {
      const state: Pick<State, "preview"> = {
        preview: { found: true, result: { newHeader: "gds" } },
      };

      const result = FEATURE_FLAGS.shouldShowGovUkRebrand(state);
      expect(result).toBe("gds");
    });

    it("should return 'cps' when preview newHeader is 'cps'", () => {
      const state: Pick<State, "preview"> = {
        preview: { found: true, result: { newHeader: "cps" } },
      };

      const result = FEATURE_FLAGS.shouldShowGovUkRebrand(state);
      expect(result).toBe("cps");
    });

    it("should return undefined when preview newHeader is undefined", () => {
      const state: Pick<State, "preview"> = {
        preview: { found: true, result: {} },
      };

      const result = FEATURE_FLAGS.shouldShowGovUkRebrand(state);
      expect(result).toBeUndefined();
    });

    it("should return undefined when preview is not found", () => {
      const state: Pick<State, "preview"> = {
        preview: { found: false, error: {} as Error },
      };

      const result = FEATURE_FLAGS.shouldShowGovUkRebrand(state);
      expect(result).toBeUndefined();
    });
  });

  describe("shouldShowMenu", () => {
    it("should return true when context is not found but user meets feature flag criteria", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: false },
        cmsSessionHint: { found: true, result: { isProxySession: true, cmsDomains: [], handoverEndpoint: "" } },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should return false when showMenuOverride is 'never-show-menu'", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true, showMenuOverride: "never-show-menu" } as any,
        cmsSessionHint: { found: false, error: {} as Error },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return true when showMenuOverride is 'always-show-menu'", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: false, FEATURE_FLAG_MENU_USERS: { adGroupIds: [] } } as any,
        auth: { isAuthed: false, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true, showMenuOverride: "always-show-menu" } as any,
        cmsSessionHint: { found: true, result: { isProxySession: true, cmsDomains: [], handoverEndpoint: "" } },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should return true when all standard conditions are met", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group", "other-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
        cmsSessionHint: { found: true, result: { isProxySession: true, cmsDomains: [], handoverEndpoint: "" } },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should return false when SHOW_MENU is false", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: false, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
        cmsSessionHint: { found: false, error: {} as Error },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return false when FEATURE_FLAG_MENU_USERS is not set", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
        cmsSessionHint: { found: false, error: {} as Error },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return false when user is not authenticated", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: false, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
        cmsSessionHint: { found: false, error: {} as Error },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return false when user is not in the required group", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["other-group", "another-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
        cmsSessionHint: { found: false, error: {} as Error },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return false when user has no groups", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
        cmsSessionHint: { found: false, error: {} as Error },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return true when user is in one of multiple groups including the required group", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["user-group", "admin-group", "editor-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
        cmsSessionHint: { found: true, result: { isProxySession: true, cmsDomains: [], handoverEndpoint: "" } },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should prioritize 'never-show-menu' override over 'always-show-menu' when testing order", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true, showMenuOverride: "never-show-menu" } as any,
        cmsSessionHint: { found: false, error: {} as Error },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return true with 'always-show-menu' override even when standard conditions are not met", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: false, FEATURE_FLAG_MENU_USERS: { adGroupIds: [] } } as any,
        auth: { isAuthed: false, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true, showMenuOverride: "always-show-menu" } as any,
        cmsSessionHint: { found: true, result: { isProxySession: true, cmsDomains: [], handoverEndpoint: "" } },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should return true when user is in adHocUsers list", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adHocUserObjectIds: ["test-object-id"] } } as any,
        auth: { isAuthed: true, groups: [], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
        cmsSessionHint: { found: true, result: { isProxySession: true, cmsDomains: [], handoverEndpoint: "" } },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should return true when user is either in adHocUsers or in adGroupIds", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"], adHocUserObjectIds: ["special-object-id"] } } as any,
        auth: { isAuthed: true, groups: [], username: "specialuser", objectId: "special-object-id" } as any,
        context: { found: true } as any,
        cmsSessionHint: { found: true, result: { isProxySession: true, cmsDomains: [], handoverEndpoint: "" } },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should return false when FEATURE_FLAG_MENU_USERS has empty arrays", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: [], adHocUserObjectIds: [] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
        cmsSessionHint: { found: false, error: {} as Error },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should return false when cmsSessionHint is found, isProxySession is false, and environment is prod", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
        cmsSessionHint: { found: true, result: { isProxySession: false, cmsDomains: [], handoverEndpoint: "" } },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "prod" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(false);
    });

    it("should continue to normal logic when cmsSessionHint is found, isProxySession is false, but environment is not prod", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
        cmsSessionHint: { found: true, result: { isProxySession: false, cmsDomains: [], handoverEndpoint: "" } },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should continue to normal logic when cmsSessionHint is found and isProxySession is true", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
        cmsSessionHint: { found: true, result: { isProxySession: true, cmsDomains: [], handoverEndpoint: "" } },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "prod" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });

    it("should fail-open and continue to normal logic when cmsSessionHint is not found", () => {
      const state: Pick<State, "config" | "auth" | "context" | "cmsSessionHint" | "flags"> = {
        config: { SHOW_MENU: true, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } } as any,
        auth: { isAuthed: true, groups: ["admin-group"], username: "testuser", objectId: "test-object-id" } as any,
        context: { found: true } as any,
        cmsSessionHint: { found: false, error: new Error("Failed to fetch hint") },
        flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, environment: "prod" },
      };

      const result = FEATURE_FLAGS.shouldShowMenu(state);
      expect(result).toBe(true);
    });
  });

  describe("surveyLink", () => {
    it("should return showLink true and url when SURVEY_LINK is set", () => {
      const state: Pick<State, "config"> = {
        config: { SURVEY_LINK: "https://example.com/survey" } as any,
      };

      const result = FEATURE_FLAGS.surveyLink(state);
      expect(result).toEqual({
        showLink: true,
        url: "https://example.com/survey",
      });
    });

    it("should return showLink false and url undefined when SURVEY_LINK is not set", () => {
      const state: Pick<State, "config"> = {
        config: {} as any,
      };

      const result = FEATURE_FLAGS.surveyLink(state);
      expect(result).toEqual({
        showLink: false,
        url: undefined,
      });
    });

    it("should return showLink false and url empty string when SURVEY_LINK is empty string", () => {
      const state: Pick<State, "config"> = {
        config: { SURVEY_LINK: "" } as any,
      };

      const result = FEATURE_FLAGS.surveyLink(state);
      expect(result).toEqual({
        showLink: false,
        url: "",
      });
    });

    it("should return showLink true and url when SURVEY_LINK is a non-empty string", () => {
      const state: Pick<State, "config"> = {
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
