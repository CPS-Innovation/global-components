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
    }) => ({
      config: { SHOW_MENU: overrides.SHOW_MENU ?? true, FEATURE_FLAG_MENU_USERS: overrides.FEATURE_FLAG_MENU_USERS } as any,
      auth: {
        isAuthed: overrides.isAuthed ?? true,
        groups: overrides.groups ?? [],
        username: overrides.username ?? "testuser",
        objectId: overrides.objectId ?? "test-object-id",
      } as any,
      context: { found: overrides.contextFound ?? true, contextIds: overrides.contextIds } as any,
      flags: { isLocalDevelopment: false, isOutSystems: false, e2eTestMode: { isE2eTestMode: false as const }, environment: overrides.environment ?? "test" },
    });

    it("should return 'hide-menu' when SHOW_MENU is false", () => {
      const state = makeState({ SHOW_MENU: false, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, groups: ["admin-group"] });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("hide-menu");
    });

    it("should return 'show-menu' when context is not a materials page", () => {
      const state = makeState({ contextIds: "case details", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-menu");
    });

    it("should return 'show-menu' when context is not found (no contextIds)", () => {
      const state = makeState({ contextFound: false, FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] } });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-menu");
    });

    it("should return 'show-menu' on materials page when user is in the required AD group", () => {
      const state = makeState({ contextIds: "case materials", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, groups: ["admin-group"] });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-menu");
    });

    it("should return 'show-menu' on materials page when user is in one of multiple groups including the required group", () => {
      const state = makeState({ contextIds: "case materials", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, groups: ["user-group", "admin-group", "editor-group"] });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-menu");
    });

    it("should return 'show-menu' on materials page when user is in adHocUsers list", () => {
      const state = makeState({ contextIds: "case materials", FEATURE_FLAG_MENU_USERS: { adHocUserObjectIds: ["test-object-id"] }, objectId: "test-object-id" });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-menu");
    });

    it("should return 'show-hint' on materials page in test env when user is not in feature group", () => {
      const state = makeState({ contextIds: "case materials", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, groups: ["other-group"], environment: "test" });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-hint");
    });

    it("should return 'show-hint' on materials page in test env when user has no groups", () => {
      const state = makeState({ contextIds: "case materials", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, groups: [], environment: "test" });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-hint");
    });

    it("should return 'show-hint' on materials page in test env when user is not authenticated", () => {
      const state = makeState({ contextIds: "case materials", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, isAuthed: false, environment: "test" });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-hint");
    });

    it("should return 'show-hint' on materials page in test env when FEATURE_FLAG_MENU_USERS is not set", () => {
      const state = makeState({ contextIds: "case materials", environment: "test" });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-hint");
    });

    it("should return 'show-hint' on materials page in test env when FEATURE_FLAG_MENU_USERS has empty arrays", () => {
      const state = makeState({ contextIds: "case materials", FEATURE_FLAG_MENU_USERS: { adGroupIds: [], adHocUserObjectIds: [] }, groups: ["admin-group"], environment: "test" });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("show-hint");
    });

    it("should return 'hide-menu' on materials page in prod env when user is not in feature group", () => {
      const state = makeState({ contextIds: "case materials", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, groups: ["other-group"], environment: "prod" });
      expect(FEATURE_FLAGS.shouldShowMenu(state)).toBe("hide-menu");
    });

    it("should return 'hide-menu' on materials page in prod env when user is not authenticated", () => {
      const state = makeState({ contextIds: "case materials", FEATURE_FLAG_MENU_USERS: { adGroupIds: ["admin-group"] }, isAuthed: false, environment: "prod" });
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
