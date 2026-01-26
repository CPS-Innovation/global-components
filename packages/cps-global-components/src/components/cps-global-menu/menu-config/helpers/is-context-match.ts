export const isContextMatch = (contextId: string = "", targetContexts: string = "") =>
  targetContexts.split(" ").includes(contextId);
