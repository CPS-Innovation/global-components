var VARIABLES = {
  upstreamUrl: "http://mock-upstream:3000/api/",
  functionsKey: "test-functions-key-12345",
  healthCheckAllowedUrls: [
    "http://mock-upstream:3000/api/health",
  ],
  healthCheckTimeoutMs: 2000,
  corsAllowedOrigins: [
    "https://example.com",
    "https://allowed-origin.com",
  ],
};

export default VARIABLES;
