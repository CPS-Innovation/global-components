import { Config, ConfigStorage, Context, ContextStorageSchema } from "./Config";

export type PotentiallyValidConfig = Omit<Config, "CONTEXTS"> & {
  CONTEXTS: Partial<Context>[];
};

export const transformConfig = ({
  CONTEXTS,
  ...rest
}: ConfigStorage): PotentiallyValidConfig => ({
  ...rest,
  CONTEXTS: recurseNode({ contexts: CONTEXTS }, {}),
});

const recurseNode = (
  node: ContextStorageSchema,
  accumulatedContextConfig: Omit<ContextStorageSchema, "contexts">
): Partial<Context>[] => {
  const results: Partial<Context>[] = [];
  const { contexts, ...rest } = node;
  const thisNodeConfig = { ...accumulatedContextConfig, ...rest };

  for (const child of contexts) {
    //results.push("path" in child ? { ...thisNodeConfig, ...child } : ...recurseNode(child, thisNodeConfig));
    if ("path" in child) {
      results.push({ ...thisNodeConfig, ...child });
    } else {
      results.push(...recurseNode(child, thisNodeConfig));
    }
  }

  return results;
};
