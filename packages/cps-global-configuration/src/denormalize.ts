import { Config2 } from "./schema2";
import { Config } from "./schema";

type ContextConfig = {
  msalRedirectUrl?: string;
  domTagDefinitions?: Array<{ cssSelector: string; regex: string }>;
  applyOutSystemsShim?: boolean;
  forceCmsAuthRefresh?: boolean;
  authorisation?: { adGroup: string; unAuthedRedirectUrl: string };
  headerCustomCssClasses?: string;
  headerCustomCssStyles?: Record<string, string | undefined>;
  showMenuOverride?: "always-show-menu" | "never-show-menu";
  cmsAuthFromStorageKey?: string;
  skipToMainContentCustomSelector?: string;
};

type FlatContext = {
  paths: string[];
  contexts: string;
} & ContextConfig;

/**
 * Recursively traverses the nested context structure and flattens it.
 * Each leaf node (with path and contextIds) inherits config from all parent nodes,
 * with deeper configs overriding parent configs.
 */
function flattenContexts(
  context: any,
  parentConfig: ContextConfig = {}
): FlatContext[] {
  // Merge parent config with current config
  const currentConfig: ContextConfig = {
    ...parentConfig,
    ...(context.msalRedirectUrl !== undefined && {
      msalRedirectUrl: context.msalRedirectUrl,
    }),
    ...(context.domTagDefinitions !== undefined && {
      domTagDefinitions: context.domTagDefinitions,
    }),
    ...(context.applyOutSystemsShim !== undefined && {
      applyOutSystemsShim: context.applyOutSystemsShim,
    }),
    ...(context.forceCmsAuthRefresh !== undefined && {
      forceCmsAuthRefresh: context.forceCmsAuthRefresh,
    }),
    ...(context.authorisation !== undefined && {
      authorisation: context.authorisation,
    }),
    ...(context.headerCustomCssClasses !== undefined && {
      headerCustomCssClasses: context.headerCustomCssClasses,
    }),
    ...(context.headerCustomCssStyles !== undefined && {
      headerCustomCssStyles: context.headerCustomCssStyles,
    }),
    ...(context.showMenuOverride !== undefined && {
      showMenuOverride: context.showMenuOverride,
    }),
    ...(context.cmsAuthFromStorageKey !== undefined && {
      cmsAuthFromStorageKey: context.cmsAuthFromStorageKey,
    }),
    ...(context.skipToMainContentCustomSelector !== undefined && {
      skipToMainContentCustomSelector: context.skipToMainContentCustomSelector,
    }),
  };

  // If this is a leaf node (has path and contextIds)
  if (context.path !== undefined && context.contextIds !== undefined) {
    return [
      {
        paths: [context.path],
        // Convert comma-delimited to space-delimited
        contexts: context.contextIds.split(",").join(" "),
        ...currentConfig,
      },
    ];
  }

  // If this has a contexts array, recurse into children
  if (context.contexts && Array.isArray(context.contexts)) {
    const results: FlatContext[] = [];
    for (const child of context.contexts) {
      results.push(...flattenContexts(child, currentConfig));
    }
    return results;
  }

  // Should never reach here with valid data
  return [];
}

/**
 * Denormalizes a Config2 (nested) to Config (flat).
 * Converts comma-delimited strings to space-delimited.
 */
export function denormalizeConfig(config2: Config2): Config {
  const flatContexts = config2.CONTEXTS.flatMap((context) =>
    flattenContexts(context)
  );

  return {
    ...config2,
    CONTEXTS: flatContexts.map((ctx) => ({
      ...ctx,
      // Ensure msalRedirectUrl is always present (required in original schema)
      msalRedirectUrl: ctx.msalRedirectUrl || "",
    })),
    LINKS: config2.LINKS.map((link) => ({
      label: link.label,
      href: link.href,
      level: link.level,
      // Convert comma-delimited strings to space-delimited and rename fields
      activeContexts: link.activeContexts.split(",").join(" "),
      visibleContexts: link.visibleContexts.split(",").join(" "),
      ...(link.openInNewTab !== undefined && {
        openInNewTab: link.openInNewTab,
      }),
      ...(link.preferEventNavigationContexts !== undefined && {
        preferEventNavigationContexts: link.preferEventNavigationContexts,
      }),
    })),
  };
}
