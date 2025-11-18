import { Config, Context } from "../schema";
import { Config2, ContextsSchemaType, ContextPathsSchema } from "../schema2";

export const denormalize = (storedConfig: Config2): Config => {
  const { CONTEXTS, ...rest } = storedConfig;

  const flattenedContexts = recurseNode(
    { contexts: CONTEXTS },
    {}
  ) as Context[];
  return { ...rest, CONTEXTS: flattenedContexts };
};

const recurseNode = (
  node: ContextsSchemaType,
  accumulatedContextConfig: Omit<ContextsSchemaType, "contexts">
): Partial<Context>[] => {
  const results: Partial<Context>[] = [];
  const { contexts, ...rest } = node;
  const thisNodeConfig = { ...accumulatedContextConfig, ...rest };

  for (const child of contexts) {
    if ("path" in child) {
      results.push({
        ...thisNodeConfig,
        paths: [child.path],
        contexts: child.contextIds,
      });
    } else {
      results.push(...recurseNode(child, thisNodeConfig));
    }
  }

  return results;
};
