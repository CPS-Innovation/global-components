export const isOutSystemsApp = (url: string) => {
  try {
    if (!url) {
      return false;
    }
    const resolvedUrl = url.toLowerCase();
    return resolvedUrl.toLowerCase().startsWith("http") && new URL(resolvedUrl).hostname.endsWith(".outsystemsenterprise.com");
  } catch (err) {
    return false;
  }
};
