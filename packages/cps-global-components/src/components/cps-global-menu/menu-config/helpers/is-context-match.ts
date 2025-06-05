export const isContextMatch = (contextStringA: string = "", contextStringB: string = "") =>
  contextStringA.split(" ").some(contextValue => contextStringB.split(" ").includes(contextValue));
