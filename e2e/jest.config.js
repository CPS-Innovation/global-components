export default {
  preset: "jest-puppeteer",
  testMatch: ["**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  testEnvironment: "./puppeteer-environment.js",
  setupFilesAfterEnv: ["./jest-setup.ts"],
  testTimeout: 30000,

  globals: {
    test: "jest",
  },
};
