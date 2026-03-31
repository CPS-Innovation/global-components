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
    const makeState = (overrides: {
      SHOW_MENU?: boolean;
      FEATURE_FLAG_MENU_USERS?: any;
      isAuthed?: boolean;
      groups?: string[];
      username?: string;
      objectId?: string;
      contextIds?: string;
      contextFound?: boolean;
      environment?: string;
      authHint?: any;
    }) => ({
      config: { SHOW_MENU: overrides.SHOW_MENU ?? true, FEATURE_FLAG_MENU_USERS: overrides.FEATURE_FLAG_MENU_USERS } as any,
      auth: {
        isAuthed: overrides.isAuthed ?? true,
        groups: overrides.groups ?? [],
        username: overrides.username ?? "testuser",
        objectId: overrides.objectId ?? "test-object-id",
      } as any,
      authHint: overrides.authHint ?? undefined,
      context: { found: overrides.contextFound ?? true, contextIds: overrides.contextIds } as any,
      flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false as const }, environment: overrides.environment ?? "test", origin: "" },
    });

    it("should return 'hide-menu' when SHOW_MENU is false", () => {
      const state = makeState({ SHOW_MENU: false, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, groups: ["admin-group"] });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("hide-menu");
    });

    it("should return 'show-menu' when context does not include materials-cwa", () => {
      const state = makeState({ contextIds: "case materials", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-menu");
    });

    it("should return 'show-menu' when context is not found (no contextIds)", () => {
      const state = makeState({ contextFound: false, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-menu");
    });

    it("should return 'show-menu' on materials-cwa page when user is in the required AD group", () => {
      const state = makeState({ contextIds: "case materials materials-cwa", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, groups: ["admin-group"] });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-menu");
    });

    it("should return 'show-menu' on materials-cwa page when user is in one of multiple groups including the required group", () => {
      const state = makeState({ contextIds: "case materials materials-cwa", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, groups: ["user-group", "admin-group", "editor-group"] });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-menu");
    });

    it("should return 'show-menu' on materials-cwa page when user is in adHocUsers list", () => {
      const state = makeState({ contextIds: "case materials materials-cwa", FEATURE_FLAG_MENU_USERS: { adHocUserObjectIds: ["test-object-id"] }, objectId: "test-object-id" });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-menu");
    });

    it("should return 'show-hint' on materials-cwa page in test env when user is not in feature group", () => {
      const state = makeState({ contextIds: "case materials materials-cwa", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, groups: ["other-group"], environment: "test" });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-hint");
    });

    it("should return 'show-hint' on materials-cwa page in test env when user is not authenticated", () => {
      const state = makeState({ contextIds: "case materials materials-cwa", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, isAuthed: false, environment: "test" });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-hint");
    });

    it("should return 'hide-menu' on materials-cwa page in prod env when user is not in feature group", () => {
      const state = makeState({ contextIds: "case materials materials-cwa", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, groups: ["other-group"], environment: "prod" });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("hide-menu");
    });

    it("should return 'hide-menu' on materials-cwa page in prod env when user is not authenticated", () => {
      const state = makeState({ contextIds: "case materials materials-cwa", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, isAuthed: false, environment: "prod" });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("hide-menu");
    });

    it("should return 'show-menu' on materials-cwa page when auth is unavailable but authHint user is in AD group", () => {
      const state = makeState({
        contextIds: "case materials materials-cwa",
        FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] },
        isAuthed: false,
        environment: "prod",
        authHint: { found: true, result: { authResult: { isAuthed: true, groups: ["admin-group"], username: "hintuser", objectId: "hint-id" }, timestamp: 1 } },
      });
      // Override auth to undefined to simulate auth not yet resolved
      (state as any).auth = undefined;
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-menu");
    });

    it("should return 'hide-menu' on materials-cwa page in prod when auth is unavailable and authHint is not found", () => {
      const state = makeState({
        contextIds: "case materials materials-cwa",
        FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] },
        isAuthed: false,
        environment: "prod",
        authHint: { found: false, error: new Error("not found") },
      });
      (state as any).auth = undefined;
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("hide-menu");
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

  describe("shouldShowHomePageNotification", () => {
    const makeState = (overrides: {
      FEATURE_FLAG_MENU_USERS?: any;
      isAuthed?: boolean;
      groups?: string[];
      objectId?: string;
      homePageNotification?: boolean;
      authHint?: any;
    }) => ({
      config: { FEATURE_FLAG_MENU_USERS: overrides.FEATURE_FLAG_MENU_USERS } as any,
      auth: {
        isAuthed: overrides.isAuthed ?? true,
        groups: overrides.groups ?? [],
        username: "testuser",
        objectId: overrides.objectId ?? "test-object-id",
      } as any,
      authHint: overrides.authHint ?? undefined,
      preview: { found: true, result: { homePageNotification: overrides.homePageNotification } } as any,
    });

    it("should return false when user is in the feature flag AD group", () => {
      const state = makeState({ FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, groups: ["admin-group"] });
      expect(FEATURE_FLAGS.shouldShowHomePageNotification(state)).toBe(false);
    });

    it("should return false when user is in adHocUsers list", () => {
      const state = makeState({ FEATURE_FLAG_MENU_USERS: { adHocUserObjectIds: ["test-object-id"] }, objectId: "test-object-id" });
      expect(FEATURE_FLAGS.shouldShowHomePageNotification(state)).toBe(false);
    });

    it("should return false when feature is generally available", () => {
      const state = makeState({ FEATURE_FLAG_MENU_USERS: { generallyAvailable: true } });
      expect(FEATURE_FLAGS.shouldShowHomePageNotification(state)).toBe(false);
    });

    it("should return true when user is not in the feature flag group", () => {
      const state = makeState({ FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, groups: ["other-group"] });
      expect(FEATURE_FLAGS.shouldShowHomePageNotification(state)).toBe(true);
    });

    it("should return true when user is not authenticated", () => {
      const state = makeState({ FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, isAuthed: false });
      expect(FEATURE_FLAGS.shouldShowHomePageNotification(state)).toBe(true);
    });

    it("should return true when FEATURE_FLAG_MENU_USERS is not configured", () => {
      const state = makeState({});
      expect(FEATURE_FLAGS.shouldShowHomePageNotification(state)).toBe(true);
    });

    it("should return true when preview homePageNotification is set, even if user is in the feature group", () => {
      const state = makeState({ FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, groups: ["admin-group"], homePageNotification: true });
      expect(FEATURE_FLAGS.shouldShowHomePageNotification(state)).toBe(true);
    });
  });

  describe("reportIssueLink", () => {
    it("should return showLink true and url when REPORT_ISSUE_LINK is set", () => {
      const state: Pick<State, "config"> = {
        config: { REPORT_ISSUE_LINK: "https://example.com/report" } as any,
      };

      const result = FEATURE_FLAGS.reportIssueLink(state);
      expect(result).toEqual({
        showLink: true,
        url: "https://example.com/report",
      });
    });

    it("should return showLink false and url undefined when REPORT_ISSUE_LINK is not set", () => {
      const state: Pick<State, "config"> = {
        config: {} as any,
      };

      const result = FEATURE_FLAGS.reportIssueLink(state);
      expect(result).toEqual({
        showLink: false,
        url: undefined,
      });
    });

    it("should return showLink false and url empty string when REPORT_ISSUE_LINK is empty string", () => {
      const state: Pick<State, "config"> = {
        config: { REPORT_ISSUE_LINK: "" } as any,
      };

      const result = FEATURE_FLAGS.reportIssueLink(state);
      expect(result).toEqual({
        showLink: false,
        url: "",
      });
    });

    it("should return showLink true and url when REPORT_ISSUE_LINK is a non-empty string", () => {
      const state: Pick<State, "config"> = {
        config: { REPORT_ISSUE_LINK: "https://servicenow.example.com/report" } as any,
      };

      const result = FEATURE_FLAGS.reportIssueLink(state);
      expect(result).toEqual({
        showLink: true,
        url: "https://servicenow.example.com/report",
      });
    });
  });
});
