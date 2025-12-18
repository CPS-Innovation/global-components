import { initialiseStore, readyState } from "./store";

describe("store", () => {
  // Initialize a fresh store before each test to ensure isolation
  beforeEach(() => {
    initialiseStore();
  });

  describe("initialiseStore", () => {
    it("should return register, mergeTags, resetContextSpecificTags and subscribe functions", () => {
      const result = initialiseStore();

      expect(result).toHaveProperty("register");
      expect(result).toHaveProperty("mergeTags");
      expect(result).toHaveProperty("resetContextSpecificTags");
      expect(result).toHaveProperty("subscribe");
      expect(typeof result.register).toBe("function");
      expect(typeof result.mergeTags).toBe("function");
      expect(typeof result.resetContextSpecificTags).toBe("function");
      expect(typeof result.subscribe).toBe("function");
    });

    describe("register function", () => {
      it("should set single property in store", () => {
        const { register } = initialiseStore();

        register({ flags: { isDevelopment: true } as any });

        const result = readyState("flags");
        if (result.isReady) {
          expect(result.state.flags).toEqual({ isDevelopment: true });
        }
      });

      it("should set multiple properties in store", () => {
        const { register } = initialiseStore();

        register({
          flags: { isDevelopment: true } as any,
          config: { CONTEXTS: [] } as any,
        });

        const result = readyState("flags", "config");
        if (result.isReady) {
          expect(result.state.flags).toEqual({ isDevelopment: true });
          expect(result.state.config).toEqual({ CONTEXTS: [] });
        }
      });

      it("should handle partial state updates", () => {
        const { register } = initialiseStore();

        register({ auth: { isAuthed: true, groups: [], username: "test", objectId: "123" } as any });

        const result = readyState("auth");
        if (result.isReady) {
          expect(result.state.auth.isAuthed).toBe(true);
        }
      });

      it("should allow updating existing properties", () => {
        const { register } = initialiseStore();

        register({ flags: { isDevelopment: true } as any });
        register({ flags: { isDevelopment: false } as any });

        const result = readyState("flags");
        if (result.isReady) {
          expect(result.state.flags).toEqual({ isDevelopment: false });
        }
      });
    });

    describe("mergeTags function", () => {
      it("should merge new tags with existing pathTags", () => {
        const { register, mergeTags } = initialiseStore();

        register({ pathTags: { caseId: "123", userId: "456" } });
        mergeTags({ pathTags: { caseId: "789", newKey: "abc" } });

        const result = readyState("tags");
        if (result.isReady) {
          expect(result.state.tags).toEqual({
            caseId: "789", // Updated value
            userId: "456", // Preserved value
            newKey: "abc", // New value
          });
        }
      });

      it("should merge new tags with existing domTags", () => {
        const { register, mergeTags } = initialiseStore();

        register({ domTags: { urn: "original", key1: "value1" } });
        mergeTags({ domTags: { urn: "updated", key2: "value2" } });

        const result = readyState("tags");
        if (result.isReady) {
          expect(result.state.tags).toEqual({
            urn: "updated",
            key1: "value1",
            key2: "value2",
          });
        }
      });

      it("should merge new tags with existing propTags", () => {
        const { register, mergeTags } = initialiseStore();

        register({ propTags: { userId: "user1", role: "admin" } });
        mergeTags({ propTags: { userId: "user2", department: "IT" } });

        const result = readyState("tags");
        if (result.isReady) {
          expect(result.state.tags).toEqual({
            userId: "user2",
            role: "admin",
            department: "IT",
          });
        }
      });

      it("should handle merging when tag type was not previously set", () => {
        const { mergeTags } = initialiseStore();

        mergeTags({ pathTags: { caseId: "123" } });

        const result = readyState("tags");
        if (result.isReady) {
          expect(result.state.tags).toEqual({
            caseId: "123",
          });
        }
      });

      it("should not affect other tag types when merging one type", () => {
        const { register, mergeTags } = initialiseStore();

        register({
          pathTags: { caseId: "123" },
          domTags: { urn: "456" },
          propTags: { userId: "789" },
        });

        mergeTags({ pathTags: { newKey: "newValue" } });

        const result = readyState("tags");
        if (result.isReady) {
          expect(result.state.tags).toEqual({
            caseId: "123",
            newKey: "newValue",
            urn: "456", // Unchanged
            userId: "789", // Unchanged
          });
        }
      });

      it("should return the merged tags after merging", () => {
        const { register, mergeTags } = initialiseStore();

        register({ pathTags: { caseId: "123", userId: "456" } });
        const result = mergeTags({ pathTags: { caseId: "789", newKey: "abc" } });

        expect(result).toEqual({
          caseId: "789", // Updated value
          userId: "456", // Preserved value
          newKey: "abc", // New value
        });
      });

      it("should return the merged tags when merging into undefined tags", () => {
        const { mergeTags } = initialiseStore();

        const result = mergeTags({ domTags: { urn: "123", key: "value" } });

        expect(result).toEqual({
          urn: "123",
          key: "value",
        });
      });

      it("should return empty object when merging empty tags", () => {
        const { register, mergeTags } = initialiseStore();

        register({ pathTags: {} });
        const result = mergeTags({ pathTags: {} });

        expect(result).toEqual({});
      });
    });

    describe("resetContextSpecificTags function", () => {
      it("should reset pathTags and domTags but not propTags", () => {
        const { register, resetContextSpecificTags } = initialiseStore();

        // Set up tags
        register({
          propTags: { userId: "123" },
          pathTags: { caseId: "456" },
          domTags: { urn: "789" },
        });

        // Verify tags are set
        let result = readyState("tags");
        expect(result.isReady).toBe(true);
        if (result.isReady) {
          expect(result.state.tags).toEqual({
            userId: "123",
            caseId: "456",
            urn: "789",
          });
        }

        // Reset context specific tags
        resetContextSpecificTags();

        // Verify only propTags remain
        result = readyState("tags");
        if (result.isReady) {
          expect(result.state.tags).toEqual({
            userId: "123",
          });
        }
      });

      it("should set tag properties to empty objects", () => {
        const { register, resetContextSpecificTags } = initialiseStore();

        register({
          pathTags: { caseId: "456" },
          domTags: { urn: "789" },
        });

        resetContextSpecificTags();

        const result = readyState("tags");
        if (result.isReady) {
          expect(result.state.tags).toEqual({});
        }
      });
    });
  });

  describe("readyState", () => {
    describe("with no keys specified", () => {
      it("should return undefined initialisationStatus when required state is undefined", () => {
        // Don't call initialiseStore() again - use the one from beforeEach
        const result = readyState();

        // When no keys are specified, isReady is always true (no specific keys to check)
        // but initialisationStatus tells us if the store is actually ready
        expect(result.isReady).toBe(true);
        expect(result.state.initialisationStatus).toBeUndefined();
      });

      it("should return isReady true when all required state is defined", () => {
        const { register } = initialiseStore();

        register({
          initialisationStatus: "complete",
        });

        const result = readyState();

        expect(result.isReady).toBe(true);
        expect(result.state.initialisationStatus).toBe("complete");
      });

      it("should return undefined initialisationStatus when flags is undefined", () => {
        const result = readyState();

        expect(result.isReady).toBe(true); // No specific keys requested
        expect(result.state.initialisationStatus).toBeUndefined();
      });
    });

    describe("with specific keys requested", () => {
      it("should return isReady true when requested keys are defined", () => {
        const { register } = initialiseStore();

        register({
          flags: { isDevelopment: true } as any,
          config: { CONTEXTS: [] } as any,
        });

        const result = readyState("flags", "config");

        expect(result.isReady).toBe(true);
        if (result.isReady) {
          expect(result.state.flags).toEqual({ isDevelopment: true });
          expect(result.state.config).toEqual({ CONTEXTS: [] });
        }
      });

      it("should return isReady false when any requested key is undefined", () => {
        const { register } = initialiseStore();

        register({
          flags: { isDevelopment: true } as any,
        });

        const result = readyState("flags", "config");

        expect(result.isReady).toBe(false);
      });

      it("should return requested properties even when isReady is false", () => {
        const { register } = initialiseStore();

        register({
          flags: { isDevelopment: true } as any,
          // config is undefined
        });

        const result = readyState("flags", "config");

        expect(result.isReady).toBe(false);
        // Properties should still be accessible, but config will be undefined
        expect(result.state.flags).toEqual({ isDevelopment: true });
        expect(result.state.config).toBeUndefined();
      });

      it("should allow lazy access to properties when isReady is false", () => {
        const { register } = initialiseStore();

        register({
          auth: { isAuthed: true, groups: [], username: "test", objectId: "123" } as any,
          // config is undefined
        });

        const result = readyState("auth", "config");

        expect(result.isReady).toBe(false);
        // Caller can still access auth even though config is undefined
        expect(result.state.auth).toBeDefined();
        expect(result.state.auth?.isAuthed).toBe(true);
        expect(result.state.config).toBeUndefined();
      });

      it("should handle single key request", () => {
        const { register } = initialiseStore();

        register({ auth: { isAuthed: true, groups: [], username: "test", objectId: "123" } as any });

        const result = readyState("auth");

        expect(result.isReady).toBe(true);
        if (result.isReady) {
          expect(result.state.auth.isAuthed).toBe(true);
        }
      });

      it("should handle tags key correctly", () => {
        const { register } = initialiseStore();

        register({
          pathTags: { caseId: "123" },
          domTags: { urn: "456" },
          propTags: { userId: "789" },
        });

        const result = readyState("tags");

        expect(result.isReady).toBe(true);
        if (result.isReady) {
          expect(result.state.tags).toEqual({
            caseId: "123",
            urn: "456",
            userId: "789",
          });
        }
      });

      it("should merge tags with correct precedence (propTags > caseDetailsTags > domTags > pathTags)", () => {
        const { register } = initialiseStore();

        register({
          pathTags: { caseId: "path-123", userId: "path-user", commonKey: "path", pathOnly: "path-value" },
          domTags: { caseId: "dom-456", commonKey: "dom", domOnly: "dom-value" },
          caseDetailsTags: { caseId: "caseDetails-789", commonKey: "caseDetails", caseDetailsOnly: "caseDetails-value" },
          propTags: { userId: "prop-user", commonKey: "prop", propOnly: "prop-value" },
        });

        const result = readyState("tags");

        if (result.isReady) {
          expect(result.state.tags).toEqual({
            caseId: "caseDetails-789", // caseDetailsTags overrides domTags
            userId: "prop-user", // propTags overrides pathTags
            commonKey: "prop", // propTags has highest precedence
            pathOnly: "path-value", // unique to pathTags
            domOnly: "dom-value", // unique to domTags
            caseDetailsOnly: "caseDetails-value", // unique to caseDetailsTags
            propOnly: "prop-value", // unique to propTags
          });
        }
      });
    });

    describe("fatalInitialisationError handling", () => {
      it("should return broken status when broken", () => {
        const { register } = initialiseStore();

        register({
          initialisationStatus: "broken",
        });

        const result = readyState();

        expect(result.state.initialisationStatus).toBe("broken");
      });

      it("should include fatalInitialisationError in responses even when undefined", () => {
        initialiseStore();

        const result = readyState();

        expect(result.state).toHaveProperty("fatalInitialisationError");
        expect(result.state.fatalInitialisationError).toBeUndefined();
      });
    });

    describe("edge cases", () => {
      it("should handle empty tags objects", () => {
        const { register } = initialiseStore();

        register({
          pathTags: {},
          domTags: {},
          propTags: {},
        });

        const result = readyState("tags");

        if (result.isReady) {
          expect(result.state.tags).toEqual({});
        }
      });

      it("should handle tags with only pathTags defined", () => {
        const { register } = initialiseStore();

        register({
          pathTags: { caseId: "123" },
        });

        const result = readyState("tags");

        if (result.isReady) {
          expect(result.state.tags).toEqual({ caseId: "123" });
        }
      });

      it("should handle tags with only domTags defined", () => {
        const { register } = initialiseStore();

        register({
          domTags: { urn: "456" },
        });

        const result = readyState("tags");

        if (result.isReady) {
          expect(result.state.tags).toEqual({ urn: "456" });
        }
      });

      it("should handle tags with only propTags defined", () => {
        const { register } = initialiseStore();

        register({
          propTags: { userId: "789" },
        });

        const result = readyState("tags");

        if (result.isReady) {
          expect(result.state.tags).toEqual({ userId: "789" });
        }
      });

      it("should handle multiple tag sources with overlapping keys", () => {
        const { register } = initialiseStore();

        register({
          pathTags: { key1: "path1", key2: "path2", key3: "path3", key4: "path4" },
          domTags: { key2: "dom2", key3: "dom3", key4: "dom4" },
          caseDetailsTags: { key3: "caseDetails3", key4: "caseDetails4" },
          propTags: { key4: "prop4" },
        });

        const result = readyState("tags");

        if (result.isReady) {
          expect(result.state.tags).toEqual({
            key1: "path1",
            key2: "dom2", // domTags overrides pathTags
            key3: "caseDetails3", // caseDetailsTags overrides domTags
            key4: "prop4", // propTags overrides all
          });
        }
      });

      it("should handle complex nested objects in config", () => {
        const { register } = initialiseStore();

        const complexConfig = {
          CONTEXTS: [
            {
              paths: ["path1", "path2"],
              contexts: "context1",
              domTagDefinitions: [{ cssSelector: ".test", regex: ".*" }],
            },
          ],
        };

        register({ config: complexConfig as any });

        const result = readyState("config");

        if (result.isReady) {
          expect(result.state.config).toEqual(complexConfig);
        }
      });

      it("should always include initialisationStatus in response", () => {
        initialiseStore();

        const result = readyState();

        expect(result.state).toHaveProperty("initialisationStatus");
      });

      it("should always include fatalInitialisationError in response", () => {
        initialiseStore();

        const result = readyState();

        expect(result.state).toHaveProperty("fatalInitialisationError");
      });
    });

    describe("multiple calls to initialiseStore", () => {
      it("should create a new independent store each time", () => {
        const store1 = initialiseStore();
        store1.register({ flags: { isDevelopment: true } as any });

        const store2 = initialiseStore();
        store2.register({ flags: { isDevelopment: false } as any });

        // Each store should maintain its own state
        // Note: readyState accesses the most recently created store
        const result = readyState("flags");
        if (result.isReady) {
          expect(result.state.flags).toEqual({ isDevelopment: false });
        }
      });
    });

    describe("lazy access pattern", () => {
      it("should allow caller to check and use properties individually when not ready", () => {
        const { register } = initialiseStore();

        register({
          flags: { isLocalDevelopment: true } as any,
          auth: { isAuthed: true, groups: ["admin"], username: "user1", objectId: "obj1" } as any,
          // config and context are undefined
        });

        const result = readyState("flags", "auth", "config", "context");

        expect(result.isReady).toBe(false);

        expect(result.state.flags.isLocalDevelopment).toBe(true);

        expect(result.state.auth.isAuthed).toBe(true);
        expect(result.state.auth.isAuthed && result.state.auth.groups).toContain("admin");

        // And handle the ones that aren't
        expect(result.state.config).toBeUndefined();
        expect(result.state.context).toBeUndefined();
      });

      it("should support progressive initialization pattern", () => {
        const { register } = initialiseStore();

        // First, only flags are available
        register({ flags: { isDevelopment: true } as any });

        const result1 = readyState("flags", "config", "auth");
        expect(result1.isReady).toBe(false);
        // When not ready, properties are still accessible but may be undefined
        // The type system allows this, letting callers handle lazily
        expect((result1.state as any).flags).toBeDefined();
        expect((result1.state as any).config).toBeUndefined();
        expect((result1.state as any).auth).toBeUndefined();

        // Then config becomes available
        register({ config: { CONTEXTS: [] } as any });

        const result2 = readyState("flags", "config", "auth");
        expect(result2.isReady).toBe(false);
        expect((result2.state as any).flags).toBeDefined();
        expect((result2.state as any).config).toBeDefined();
        expect((result2.state as any).auth).toBeUndefined();

        // Finally auth becomes available
        register({ auth: { isAuthed: true, groups: [], username: "test", objectId: "123" } as any });

        const result3 = readyState("flags", "config", "auth");
        expect(result3.isReady).toBe(true);
        if (result3.isReady) {
          expect(result3.state.flags).toBeDefined();
          expect(result3.state.config).toBeDefined();
          expect(result3.state.auth).toBeDefined();
        }
      });

      it("should return all properties when no keys specified and not ready", () => {
        const { register } = initialiseStore();

        register({
          flags: { isDevelopment: true } as any,
          auth: { isAuthed: true, groups: [], username: "test", objectId: "123" } as any,
          // Other properties undefined
        });

        const result = readyState();

        // isReady based on whether ALL properties are defined
        expect(result.isReady).toBe(true); // No specific keys = always ready
        expect(result.state.initialisationStatus).toBeUndefined(); // But status shows not all state is ready
      });

      it("should only return requested properties when ready", () => {
        const { register } = initialiseStore();

        register({
          flags: { isDevelopment: true } as any,
          config: { CONTEXTS: [] } as any,
          auth: { isAuthed: true, groups: [], username: "test", objectId: "123" } as any,
          // context is undefined
        });

        // Request only flags and config
        const result = readyState("flags", "config");

        expect(result.isReady).toBe(true);
        if (result.isReady) {
          // Requested properties are available and typed as non-undefined
          expect(result.state.flags).toEqual({ isDevelopment: true });
          expect(result.state.config).toEqual({ CONTEXTS: [] });

          // Non-requested properties are NOT available (only requested + always-returned)
          expect((result.state as any).auth).toBeUndefined();
          expect((result.state as any).context).toBeUndefined();

          // But always-returned properties are available
          expect(result.state.initialisationStatus).toBeUndefined();
          expect(result.state.fatalInitialisationError).toBeUndefined();
        }
      });

      it("should include optional properties when using two-array syntax", () => {
        const { register } = initialiseStore();

        register({
          config: { CONTEXTS: [] } as any,
          context: { found: true } as any,
          // auth is undefined
        });

        // Request config and context as required, auth as optional
        const result = readyState(["config", "context"] as const, ["auth"] as const);

        expect(result.isReady).toBe(true);
        if (result.isReady) {
          // Required properties are guaranteed non-undefined
          expect(result.state.config).toBeDefined();
          expect(result.state.context).toBeDefined();

          // Can check auth even though it wasn't requested
          // This is useful for functions that take "config & { auth?: AuthResult }"
          expect(result.state.auth).toBeUndefined();
        }
      });
    });

    describe("caseDetailsTags handling", () => {
      it("should include caseDetailsTags in merged tags", () => {
        const { register } = initialiseStore();

        register({
          caseDetailsTags: { defendantName: "John Doe", prosecutionReference: "PR-123" },
        });

        const result = readyState("tags");

        if (result.isReady) {
          expect(result.state.tags).toEqual({
            defendantName: "John Doe",
            prosecutionReference: "PR-123",
          });
        }
      });

      it("should merge caseDetailsTags with other tag sources", () => {
        const { register } = initialiseStore();

        register({
          pathTags: { caseId: "123" },
          domTags: { urn: "urn:456" },
          caseDetailsTags: { defendantName: "John Doe" },
          propTags: { userId: "user-789" },
        });

        const result = readyState("tags");

        if (result.isReady) {
          expect(result.state.tags).toEqual({
            caseId: "123",
            urn: "urn:456",
            defendantName: "John Doe",
            userId: "user-789",
          });
        }
      });

      it("should allow caseDetailsTags to override domTags but not propTags", () => {
        const { register } = initialiseStore();

        register({
          domTags: { sharedKey: "dom-value" },
          caseDetailsTags: { sharedKey: "caseDetails-value" },
        });

        let result = readyState("tags");
        if (result.isReady) {
          expect(result.state.tags.sharedKey).toBe("caseDetails-value");
        }

        // Now add propTags which should override
        register({
          propTags: { sharedKey: "prop-value" },
        });

        result = readyState("tags");
        if (result.isReady) {
          expect(result.state.tags.sharedKey).toBe("prop-value");
        }
      });
    });

    describe("caseDetails handling", () => {
      it("should register caseDetails", () => {
        const { register } = initialiseStore();

        register({
          caseDetails: { urn: "URN-123" },
        });

        const result = readyState("caseDetails");

        if (result.isReady) {
          expect(result.state.caseDetails).toEqual({ urn: "URN-123" });
        }
      });

      it("should allow partial caseDetails updates", () => {
        const { register } = initialiseStore();

        register({
          caseDetails: { urn: "URN-123" },
        });

        register({
          caseDetails: { isDcfCase: true },
        });

        const result = readyState("caseDetails");

        if (result.isReady) {
          // Note: register replaces, doesn't merge at property level
          expect(result.state.caseDetails).toEqual({ isDcfCase: true });
        }
      });
    });

    describe("caseIdentifiers handling", () => {
      it("should handle caseIdentifiers registration", () => {
        const { register } = initialiseStore();

        register({
          caseIdentifiers: { caseId: "123" },
        });

        const result = readyState("caseIdentifiers");

        if (result.isReady) {
          expect(result.state.caseIdentifiers).toEqual({ caseId: "123" });
        }
      });
    });

    describe("build handling", () => {
      it("should register build information", () => {
        const { register } = initialiseStore();

        const buildInfo = {
          version: "1.0.0",
          buildDate: "2024-01-01",
        };

        register({
          build: buildInfo as any,
        });

        const result = readyState("build");

        if (result.isReady) {
          expect(result.state.build).toEqual(buildInfo);
        }
      });
    });

    describe("correlationIds handling", () => {
      it("should register correlationIds", () => {
        const { register } = initialiseStore();

        register({
          correlationIds: { correlationId: "corr-123", sessionId: "sess-456" } as any,
        });

        const result = readyState("correlationIds");

        if (result.isReady) {
          expect(result.state.correlationIds).toEqual({ correlationId: "corr-123", sessionId: "sess-456" });
        }
      });
    });
  });
});
