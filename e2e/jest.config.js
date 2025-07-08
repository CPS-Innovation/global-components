export default {
  preset: "jest-puppeteer",
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  testEnvironment: "jest-environment-puppeteer",
  setupFilesAfterEnv: ["expect-puppeteer", "./jest-setup.ts"],
  testTimeout: 30000,
};
