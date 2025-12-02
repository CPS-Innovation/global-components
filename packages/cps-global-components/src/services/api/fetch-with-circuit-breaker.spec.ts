import { fetchWithCircuitBreaker } from "./fetch-with-circuit-breaker";
import { Config } from "cps-global-configuration";
import { TrackEvent } from "../analytics/analytics-event";

describe("fetchWithCircuitBreaker", () => {
  let mockConfig: Config;
  let mockTrackEvent: jest.Mock<ReturnType<TrackEvent>, Parameters<TrackEvent>>;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockConfig = {} as Config;
    mockTrackEvent = jest.fn();
    mockFetch = jest.fn().mockResolvedValue(new Response("ok"));
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("with default configuration", () => {
    it("should allow requests under the limit", async () => {
      const wrappedFetch = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      await wrappedFetch("https://example.com");
      await wrappedFetch("https://example.com");
      await wrappedFetch("https://example.com");

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should allow exactly maxPerInterval requests", async () => {
      const wrappedFetch = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      // Default is 5 requests per 3000ms
      for (let i = 0; i < 5; i++) {
        await wrappedFetch("https://example.com");
      }

      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it("should trip the circuit breaker when limit is exceeded", async () => {
      const wrappedFetch = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      // Make 10 successful requests
      for (let i = 0; i < 10; i++) {
        await wrappedFetch("https://example.com");
      }

      // 6th request should fail
      await expect(wrappedFetch("https://example.com")).rejects.toThrow("Circuit breaker tripped - too many requests");
    });

    it("should track event when circuit breaker trips", async () => {
      const wrappedFetch = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      for (let i = 0; i < 10; i++) {
        await wrappedFetch("https://example.com");
      }

      await expect(wrappedFetch("https://example.com")).rejects.toThrow();

      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: "fetch",
        error: "Circuit breaker tripped: 10 calls/3000 milliseconds exceeded",
      });
    });

    it("should remain tripped after initial trip", async () => {
      const wrappedFetch = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      for (let i = 0; i < 10; i++) {
        await wrappedFetch("https://example.com");
      }

      // Trip the breaker
      await expect(wrappedFetch("https://example.com")).rejects.toThrow();

      // Subsequent requests should also fail
      await expect(wrappedFetch("https://example.com")).rejects.toThrow("Circuit breaker tripped - too many requests");
      await expect(wrappedFetch("https://example.com")).rejects.toThrow("Circuit breaker tripped - too many requests");

      // trackEvent should only be called once (on first trip)
      expect(mockTrackEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe("with custom configuration", () => {
    it("should respect custom maxPerInterval", async () => {
      mockConfig = {
        FETCH_CIRCUIT_BREAKER_CONFIG: {
          maxPerInterval: 2,
          intervalMs: 3000,
        },
      } as Config;

      const wrappedFetch = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      await wrappedFetch("https://example.com");
      await wrappedFetch("https://example.com");

      await expect(wrappedFetch("https://example.com")).rejects.toThrow("Circuit breaker tripped - too many requests");

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should respect custom intervalMs", async () => {
      mockConfig = {
        FETCH_CIRCUIT_BREAKER_CONFIG: {
          maxPerInterval: 5,
          intervalMs: 1000,
        },
      } as Config;

      const wrappedFetch = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        await wrappedFetch("https://example.com");
      }

      expect(mockFetch).toHaveBeenCalledTimes(5);
    });
  });

  describe("sliding window behavior", () => {
    it("should remove old timestamps from the window", async () => {
      mockConfig = {
        FETCH_CIRCUIT_BREAKER_CONFIG: {
          maxPerInterval: 2,
          intervalMs: 1000,
        },
      } as Config;

      const wrappedFetch = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      // Make 2 requests at time 0
      await wrappedFetch("https://example.com");
      await wrappedFetch("https://example.com");

      // Advance time past the interval
      jest.advanceTimersByTime(1001);

      // Should be able to make more requests now
      await wrappedFetch("https://example.com");
      await wrappedFetch("https://example.com");

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("should correctly track requests within the sliding window", async () => {
      mockConfig = {
        FETCH_CIRCUIT_BREAKER_CONFIG: {
          maxPerInterval: 3,
          intervalMs: 1000,
        },
      } as Config;

      const wrappedFetch = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      // Make 2 requests at time 0
      await wrappedFetch("https://example.com");
      await wrappedFetch("https://example.com");

      // Advance 500ms
      jest.advanceTimersByTime(500);

      // Make 1 more request - should still be allowed (3 total in window)
      await wrappedFetch("https://example.com");

      // 4th request should fail
      await expect(wrappedFetch("https://example.com")).rejects.toThrow();

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should allow new requests after old ones expire from window", async () => {
      mockConfig = {
        FETCH_CIRCUIT_BREAKER_CONFIG: {
          maxPerInterval: 2,
          intervalMs: 1000,
        },
      } as Config;

      const wrappedFetch = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      // Request at time 0
      await wrappedFetch("https://example.com");

      // Advance 600ms
      jest.advanceTimersByTime(600);

      // Request at time 600
      await wrappedFetch("https://example.com");

      // Advance 500ms (now at 1100ms, first request should be expired)
      jest.advanceTimersByTime(500);

      // Should be allowed because first request is outside the window
      await wrappedFetch("https://example.com");

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("fetch passthrough", () => {
    it("should pass arguments to the real fetch", async () => {
      const wrappedFetch = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      const options: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: "test" }),
      };

      await wrappedFetch("https://example.com/api", options);

      expect(mockFetch).toHaveBeenCalledWith("https://example.com/api", options);
    });

    it("should return the response from the real fetch", async () => {
      const expectedResponse = new Response(JSON.stringify({ success: true }));
      mockFetch.mockResolvedValue(expectedResponse);

      const wrappedFetch = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      const response = await wrappedFetch("https://example.com");

      expect(response).toBe(expectedResponse);
    });

    it("should propagate errors from the real fetch", async () => {
      const fetchError = new Error("Network error");
      mockFetch.mockRejectedValue(fetchError);

      const wrappedFetch = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      await expect(wrappedFetch("https://example.com")).rejects.toThrow("Network error");
    });
  });

  describe("independent circuit breaker instances", () => {
    it("should maintain separate state for different instances", async () => {
      mockConfig = {
        FETCH_CIRCUIT_BREAKER_CONFIG: {
          maxPerInterval: 2,
          intervalMs: 1000,
        },
      } as Config;

      const wrappedFetch1 = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      const wrappedFetch2 = fetchWithCircuitBreaker({
        config: mockConfig,
        trackEvent: mockTrackEvent,
      })(mockFetch);

      // Trip first circuit breaker
      await wrappedFetch1("https://example.com");
      await wrappedFetch1("https://example.com");
      await expect(wrappedFetch1("https://example.com")).rejects.toThrow();

      // Second circuit breaker should still work
      await wrappedFetch2("https://example.com");
      await wrappedFetch2("https://example.com");

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });
});
