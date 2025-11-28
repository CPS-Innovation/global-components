
export default {
  upstreamUrl: "http://mock-upstream:3000/api/",
  functionsKey: "test-functions-key",
  healthCheckAllowedUrls: ["http://allowed-url.com/health"],
  healthCheckTimeoutMs: 2000,
  corsAllowedOrigins: ["https://example.com", "https://allowed-origin.com"],
};
