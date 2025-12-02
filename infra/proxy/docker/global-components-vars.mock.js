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
  deployVersion: 0,
  tenantId: "test-tenant-id",
  applicationId: "test-app-id",
  previewHtmlBlobUrl: "http://mock-upstream:3000/preview/index.html",
};

export default VARIABLES;
