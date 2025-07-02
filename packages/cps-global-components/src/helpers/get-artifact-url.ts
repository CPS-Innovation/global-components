export const getArtifactUrl = (fileName: string) => new URL("./", import.meta.url).href + fileName;
