var VARIABLES = {
  upstreamUrl: "https://your-function-app.azurewebsites.net/api/",
  functionsKey: "your-function-key-here",
  healthCheckAllowedUrls: [
    "https://example.com/health",
  ],
  healthCheckTimeoutMs: 2000,
  corsAllowedOrigins: [
    "https://example.com",
    "https://app.example.com",
  ],
  deployVersion: 0,
};

export default VARIABLES;
