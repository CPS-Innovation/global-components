const getEnvironmentName = (rootUrl: string): string => {
  try {
    const url = new URL(rootUrl);
    const match = url.pathname.match(/\/global-components\/([^/]+)\//);

    // We return a loose string rather than something more strongly typed as our environment
    //  is dictated by e.g. the test in config.test.json, and we can arbitrarily add more
    //  environments by adding more config files.
    return match ? match[1] : "unknown";
  } catch {
    return "unknown";
  }
};

export const getEnvironment = (rootUrl: string): { environment: string; origin: string } => ({
  environment: getEnvironmentName(rootUrl),
  origin: new URL(rootUrl).origin,
});
