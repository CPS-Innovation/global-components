// jest.mock("cps-global-configuration", () => ({
//   validateConfig: jest.fn(),
// }));

// jest.mock("./script-url", () => ({
//   scriptUrl: jest.fn(),
// }));

// import { CONFIG_ASYNC } from "./config-async";

// const mockFetch = jest.fn();
// global.fetch = mockFetch;

// describe("config", () => {
//   let mockValidateConfig: jest.Mock;
//   let mockScriptUrl: jest.Mock;

//   beforeEach(() => {
//     jest.clearAllMocks();
//     jest.resetModules();

//     const { validateConfig } = require("cps-global-configuration");
//     const { scriptUrl } = require("./script-url");

//     mockValidateConfig = validateConfig as jest.Mock;
//     mockScriptUrl = scriptUrl as jest.Mock;
//   });

//   describe("CONFIG_ASYNC", () => {
//     it("should fetch and return valid config", async () => {
//       const mockConfig = {
//         APP_INSIGHTS_KEY: "test-key",
//         ENVIRONMENT: "test",
//       };

//       mockScriptUrl.mockReturnValue("https://example.com/script.js");
//       mockFetch.mockResolvedValue({
//         json: jest.fn().mockResolvedValue(mockConfig),
//       });
//       mockValidateConfig.mockReturnValue({
//         success: true,
//         data: mockConfig,
//         error: null,
//       });

//       const config = await CONFIG_ASYNC();

//       expect(mockFetch).toHaveBeenCalledWith("https://example.com/config.json");
//       expect(mockValidateConfig).toHaveBeenCalledWith(mockConfig);
//       expect(config).toEqual(mockConfig);
//     });

//     xit("should throw error when validation fails", async () => {
//       const mockInvalidConfig = {
//         invalid: "data",
//       };
//       const mockError = { message: "Invalid schema" };

//       mockScriptUrl.mockReturnValue("https://example.com/script.js");
//       mockFetch.mockResolvedValue({
//         json: jest.fn().mockResolvedValue(mockInvalidConfig),
//       });
//       mockValidateConfig.mockReturnValue({
//         success: false,
//         data: null,
//         error: mockError,
//       });

//       await expect(CONFIG_ASYNC()).rejects.toThrow(`Invalid config JSON retrieved from https://example.com/config.json: ${JSON.stringify(mockError)}`);
//     });

//     xit("should throw error when fetch fails", async () => {
//       mockScriptUrl.mockReturnValue("https://example.com/script.js");
//       mockFetch.mockRejectedValue(new Error("Network error"));

//       await expect(CONFIG_ASYNC()).rejects.toThrow(`Invalid config JSON retrieved from https://example.com/config.json: ${JSON.stringify(new Error("Network error"))}`);
//     });

//     xit("should throw error when JSON parsing fails", async () => {
//       mockScriptUrl.mockReturnValue("https://example.com/script.js");
//       mockFetch.mockResolvedValue({
//         json: jest.fn().mockRejectedValue(new SyntaxError("Invalid JSON")),
//       });

//       await expect(CONFIG_ASYNC()).rejects.toThrow(/Invalid config JSON retrieved from https:\/\/example\.com\/config\.json:/);
//     });

//     xit("should cache the config promise", async () => {
//       const mockConfig = {
//         APP_INSIGHTS_KEY: "test-key",
//         ENVIRONMENT: "test",
//       };

//       mockScriptUrl.mockReturnValue("https://example.com/script.js");
//       mockFetch.mockResolvedValue({
//         json: jest.fn().mockResolvedValue(mockConfig),
//       });
//       mockValidateConfig.mockReturnValue({
//         success: true,
//         data: mockConfig,
//         error: null,
//       });

//       const config1 = await CONFIG_ASYNC();
//       const config2 = await CONFIG_ASYNC();

//       expect(mockFetch).toHaveBeenCalledTimes(1);
//       expect(config1).toBe(config2);
//     });

//     xit("should construct correct config URL with trailing slash", async () => {
//       const mockConfig = { test: "data" };

//       mockScriptUrl.mockReturnValue("https://example.com/scripts/bundle.js");
//       mockFetch.mockResolvedValue({
//         json: jest.fn().mockResolvedValue(mockConfig),
//       });
//       mockValidateConfig.mockReturnValue({
//         success: true,
//         data: mockConfig,
//         error: null,
//       });

//       await CONFIG_ASYNC();

//       expect(mockFetch).toHaveBeenCalledWith("https://example.com/scripts/config.json");
//     });
//   });
// });
