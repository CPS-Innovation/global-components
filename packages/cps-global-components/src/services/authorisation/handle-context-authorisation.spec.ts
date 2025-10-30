import { handleContextAuthorisation } from "./handle-context-authorisation";
import { AuthResult, FailedAuth } from "../auth/AuthResult";
import { FoundContext } from "../context/FoundContext";

describe("handleContextAuthorisation", () => {
  let mockReplace: jest.Mock;
  let mockWindow: Window;

  beforeEach(() => {
    mockReplace = jest.fn();
    mockWindow = {
      location: {
        replace: mockReplace,
      },
    } as unknown as Window;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("when context is not found", () => {
    it("should not redirect", () => {
      const context: FoundContext = { found: false };
      const auth: AuthResult = {
        isAuthed: true,
        username: "testuser",
        name: "Test User",
        objectId: "1",
        groups: ["group1"],
      };

      const result = handleContextAuthorisation({
        window: mockWindow,
        context,
        auth,
      });

      expect(result).toEqual({ isRedirecting: false });
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe("when context has no authorisation rule", () => {
    it("should not redirect for authenticated user", () => {
      const context: FoundContext = {
        found: true,
        pathTags: {},
        contextIndex: 0,
        msalRedirectUrl: "https://example.com",
        paths: ["/test"],
      } as FoundContext;
      const auth: AuthResult = {
        isAuthed: true,
        username: "testuser",
        name: "Test User",
        objectId: "1",
        groups: ["group1"],
      };

      const result = handleContextAuthorisation({
        window: mockWindow,
        context,
        auth,
      });

      expect(result).toEqual({ isRedirecting: false });
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("should not redirect for unauthenticated user", () => {
      const context: FoundContext = {
        found: true,
        pathTags: {},
        contextIndex: 0,
        msalRedirectUrl: "https://example.com",
        paths: ["/test"],
      } as FoundContext;
      const auth: AuthResult = {
        isAuthed: false,
        knownErrorType: "NoAccountFound",
        reason: "No account found",
      };

      const result = handleContextAuthorisation({
        window: mockWindow,
        context,
        auth,
      });

      expect(result).toEqual({ isRedirecting: false });
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe("when context has authorisation rule", () => {
    const authorisedContext: FoundContext = {
      found: true,
      pathTags: {},
      contextIndex: 0,
      msalRedirectUrl: "https://example.com",
      paths: ["/test"],
      authorisation: {
        adGroup: "required-group",
        unAuthedRedirectUrl: "https://unauthorized.example.com",
      },
    } as FoundContext;

    describe("and user is authenticated with required AD group", () => {
      it("should not redirect", () => {
        const auth: AuthResult = {
          isAuthed: true,
          username: "testuser",
          name: "Test User",
          objectId: "1",
          groups: ["other-group", "required-group", "another-group"],
        };

        const result = handleContextAuthorisation({
          window: mockWindow,
          context: authorisedContext,
          auth,
        });

        expect(result).toEqual({ isRedirecting: false });
        expect(mockReplace).not.toHaveBeenCalled();
      });
    });

    describe("and user is authenticated but without required AD group", () => {
      it("should redirect to unauthorised URL", () => {
        const auth: AuthResult = {
          isAuthed: true,
          username: "testuser",
          name: "Test User",
          objectId: "1",
          groups: ["other-group", "another-group"],
        };

        const result = handleContextAuthorisation({
          window: mockWindow,
          context: authorisedContext,
          auth,
        });

        expect(result).toEqual({ isRedirecting: true });
        expect(mockReplace).toHaveBeenCalledWith("https://unauthorized.example.com");
      });

      it("should redirect when groups array is empty", () => {
        const auth: AuthResult = {
          isAuthed: true,
          username: "testuser",
          name: "Test User",
          objectId: "1",
          groups: [],
        };

        const result = handleContextAuthorisation({
          window: mockWindow,
          context: authorisedContext,
          auth,
        });

        expect(result).toEqual({ isRedirecting: true });
        expect(mockReplace).toHaveBeenCalledWith("https://unauthorized.example.com");
      });
    });

    describe("and user is not authenticated", () => {
      it("should redirect to unauthorised URL", () => {
        const auth: AuthResult = {
          isAuthed: false,
          knownErrorType: "NoAccountFound",
          reason: "No account found",
        };

        const result = handleContextAuthorisation({
          window: mockWindow,
          context: authorisedContext,
          auth,
        });

        expect(result).toEqual({ isRedirecting: true });
        expect(mockReplace).toHaveBeenCalledWith("https://unauthorized.example.com");
      });

      it("should redirect for different auth failure types", () => {
        const failureTypes: FailedAuth["knownErrorType"][] = ["ConfigurationIncomplete", "RedirectLocationIsApp", "ConditionalAccessRule", "MultipleIdentities", "Unknown"];

        failureTypes.forEach(knownErrorType => {
          const auth: AuthResult = {
            isAuthed: false,
            knownErrorType,
            reason: `Failed with ${knownErrorType}`,
          };

          const result = handleContextAuthorisation({
            window: mockWindow,
            context: authorisedContext,
            auth,
          });

          expect(result).toEqual({ isRedirecting: true });
          expect(mockReplace).toHaveBeenCalledWith("https://unauthorized.example.com");
        });
      });
    });
  });

  describe("edge cases", () => {
    it("should handle context with multiple AD groups correctly", () => {
      const context: FoundContext = {
        found: true,
        pathTags: {},
        contextIndex: 0,
        msalRedirectUrl: "https://example.com",
        paths: ["/test"],
        authorisation: {
          adGroup: "group-with-special-chars@domain.com",
          unAuthedRedirectUrl: "https://unauthorized.example.com",
        },
      } as FoundContext;
      const auth: AuthResult = {
        isAuthed: true,
        username: "testuser",
        name: "Test User",
        objectId: "1",
        groups: ["group-with-special-chars@domain.com"],
      };

      const result = handleContextAuthorisation({
        window: mockWindow,
        context,
        auth,
      });

      expect(result).toEqual({ isRedirecting: false });
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("should handle case-sensitive AD group matching", () => {
      const context: FoundContext = {
        found: true,
        pathTags: {},
        contextIndex: 0,
        msalRedirectUrl: "https://example.com",
        paths: ["/test"],
        authorisation: {
          adGroup: "Required-Group",
          unAuthedRedirectUrl: "https://unauthorized.example.com",
        },
      } as FoundContext;
      const auth: AuthResult = {
        isAuthed: true,
        username: "testuser",
        name: "Test User",
        objectId: "1",
        groups: ["required-group"],
      };

      const result = handleContextAuthorisation({
        window: mockWindow,
        context,
        auth,
      });

      expect(result).toEqual({ isRedirecting: true });
      expect(mockReplace).toHaveBeenCalledWith("https://unauthorized.example.com");
    });

    it("should handle auth with undefined name", () => {
      const context: FoundContext = {
        found: true,
        pathTags: {},
        contextIndex: 0,
        msalRedirectUrl: "https://example.com",
        paths: ["/test"],
        authorisation: {
          adGroup: "required-group",
          unAuthedRedirectUrl: "https://unauthorized.example.com",
        },
      } as FoundContext;
      const auth: AuthResult = {
        isAuthed: true,
        username: "testuser",
        name: undefined,
        objectId: "1",
        groups: ["required-group"],
      };

      const result = handleContextAuthorisation({
        window: mockWindow,
        context,
        auth,
      });

      expect(result).toEqual({ isRedirecting: false });
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
