export const isOutSystemsApp = (url: string) => url.startsWith("http") && new URL(url).hostname.includes(".outsystemsenterprise.com");
