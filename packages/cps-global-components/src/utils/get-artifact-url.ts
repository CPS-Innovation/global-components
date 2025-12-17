export const getArtifactUrl = (rootUrl: string, path: string) => new URL(path, rootUrl).href;
