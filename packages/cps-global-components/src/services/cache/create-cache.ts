import { z } from "zod";
import { makeConsole } from "../../logging/makeConsole";

type CacheEntry<T = any> = {
  data: T;
  timestamp: number;
};

type CacheStore = {
  version: number;
  entities: Record<string, Record<string, CacheEntry>>; // entities.user.123 = {...}
};

type EntityConfig<T> = {
  cacheableFields: (keyof T)[];
  maxAge?: number;
  maxItems?: number;
};

export type LocalStorageCache = ReturnType<typeof createCache>;

const { _warn, _debug } = makeConsole("createCache");

export function createCache(storageKey: string) {
  const CACHE_VERSION = 2;

  // Load entire cache once
  const loadCache = (): CacheStore => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const cache = JSON.parse(stored) as CacheStore;
        // Check version for potential migration
        if (cache.version === CACHE_VERSION) {
          return cache;
        } else {
          // Version mismatch - clear old cache
          _warn(`Cache version mismatch (found ${cache.version}, expected ${CACHE_VERSION}). Clearing cache.`);
          localStorage.removeItem(storageKey);
        }
      }
    } catch (e) {
      console.warn("Failed to load cache:", e);
    }

    return { version: CACHE_VERSION, entities: {} };
  };

  // Save entire cache
  const saveCache = (cache: CacheStore): void => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cache));
    } catch (e) {
      console.warn("Failed to save cache:", e);
    }
  };

  // Prune on initialization
  const pruneCache = (cache: CacheStore, globalMaxAge: number = 24 * 60 * 60 * 1000, globalMaxEntries: number = 200): CacheStore => {
    const now = Date.now();
    const prunedEntities: Record<string, Record<string, CacheEntry>> = {};

    // Collect all valid entries
    const allValidEntries: Array<{
      entityType: string;
      id: string;
      entry: CacheEntry;
    }> = [];

    for (const [entityType, entityEntries] of Object.entries(cache.entities)) {
      for (const [id, entry] of Object.entries(entityEntries)) {
        if (now - entry.timestamp < globalMaxAge) {
          allValidEntries.push({ entityType, id, entry });
        }
      }
    }

    // Sort by timestamp (newest first) and limit total
    allValidEntries.sort((a, b) => b.entry.timestamp - a.entry.timestamp);
    const entriesToKeep = allValidEntries.slice(0, globalMaxEntries);

    // Rebuild the structure
    for (const { entityType, id, entry } of entriesToKeep) {
      if (!prunedEntities[entityType]) {
        prunedEntities[entityType] = {};
      }
      prunedEntities[entityType][id] = entry;
    }

    return {
      version: CACHE_VERSION,
      entities: prunedEntities,
    };
  };

  // Initialize and prune
  let cache = pruneCache(loadCache());
  saveCache(cache);

  // Create entity-specific functions
  const createEntityCache = <S extends z.ZodObject<any>>(entityType: string, schema: S, config: EntityConfig<z.infer<S>>) => {
    type T = z.infer<S>;

    // Ensure entity section exists
    if (!cache.entities[entityType]) {
      cache.entities[entityType] = {};
    }

    // Overloaded selectFields for better type inference
    function selectFields<K extends keyof T>(data: T, fields: K[]): Pick<T, K>;
    function selectFields(data: T, fields: undefined): T;
    function selectFields<K extends keyof T>(data: T, fields?: K[]): Pick<T, K> | T {
      if (!fields) return data;
      return fields.reduce((acc, field) => {
        acc[field] = data[field];
        return acc;
      }, {} as Pick<T, K>);
    }

    // Overloaded get function for retrieving cached data
    function get(id: string): Partial<T> {
      const entry = cache.entities[entityType]?.[id];
      return entry?.data || {};
    }

    // Overloaded fetch function for precise return types
    async function fetch<K extends keyof T>(id: string, fetcher: (id: string) => Promise<unknown>, options: { fields: K[]; forceRefresh?: boolean }): Promise<Pick<T, K>>;

    async function fetch(id: string, fetcher: (id: string) => Promise<unknown>, options?: { fields?: undefined; forceRefresh?: boolean }): Promise<T>;

    async function fetch<K extends keyof T>(
      id: string,
      fetcher: (id: string) => Promise<unknown>,
      options: { fields?: K[]; forceRefresh?: boolean } = {},
    ): Promise<Pick<T, K> | T> {
      const { fields, forceRefresh = false } = options;

      if (!forceRefresh) {
        const entry = cache.entities[entityType]?.[id];

        if (entry) {
          const requestedFields = fields || (Object.keys(schema.shape) as (keyof T)[]);
          const cachedFields = Object.keys(entry.data) as (keyof T)[];
          const canServeFromCache = requestedFields.every(field => cachedFields.includes(field));

          if (canServeFromCache) {
            return selectFields(entry.data as T, fields as K[]);
          }
        }
      }

      // Fetch fresh data
      const rawData = await fetcher(id);
      const validatedData = schema.parse(rawData);

      // Store only cacheable fields
      const cacheableData = config.cacheableFields.reduce((acc, field) => {
        acc[field] = validatedData[field];
        return acc;
      }, {} as Partial<T>);

      // Ensure entity section exists
      if (!cache.entities[entityType]) {
        cache.entities[entityType] = {};
      }

      cache.entities[entityType][id] = {
        data: cacheableData,
        timestamp: Date.now(),
      };

      saveCache(cache);

      return selectFields(validatedData, fields as K[]);
    }

    const invalidate = (id: string): void => {
      if (cache.entities[entityType]) {
        delete cache.entities[entityType][id];
        // Clean up empty entity sections
        if (Object.keys(cache.entities[entityType]).length === 0) {
          delete cache.entities[entityType];
        }
        saveCache(cache);
      }
    };

    const invalidateAll = (): void => {
      delete cache.entities[entityType];
      saveCache(cache);
    };

    const getEntityStats = () => {
      const entityData = cache.entities[entityType] || {};
      const entries = Object.values(entityData);

      return {
        count: entries.length,
        maxItems: config.maxItems,
        oldest: entries.length > 0 ? new Date(Math.min(...entries.map(e => e.timestamp))) : null,
        newest: entries.length > 0 ? new Date(Math.max(...entries.map(e => e.timestamp))) : null,
      };
    };

    return {
      get,
      fetch,
      invalidate,
      invalidateAll,
      getStats: getEntityStats,
    };
  };

  // Global cache operations
  const clearAll = () => {
    cache = { version: CACHE_VERSION, entities: {} };
    saveCache(cache);
  };

  const getStats = () => {
    const stats: Record<string, number> = {};
    let totalEntries = 0;

    for (const [entityType, entityEntries] of Object.entries(cache.entities)) {
      const count = Object.keys(entityEntries).length;
      stats[entityType] = count;
      totalEntries += count;
    }

    return {
      totalEntries,
      byEntity: stats,
      sizeEstimate: JSON.stringify(cache).length * 2,
    };
  };

  _debug({ stats: getStats() });
  return {
    createEntityCache,
    clearAll,
    getStats,
  };
}
