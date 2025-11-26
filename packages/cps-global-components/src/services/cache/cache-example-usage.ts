import { z } from "zod";

// Example usage:

import { createCache } from "./create-cache";

// Define your schema
const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(), // PII - won't be cached
  createdAt: z.string(),
  role: z.string(),
  ssn: z.string(), // PII - won't be cached
  publicBio: z.string(),
  avatar: z.string().optional(),
});

export type User = z.infer<typeof UserSchema>;

const cacheableFields = ["id", "username", "createdAt", "role", "publicBio", "avatar"] as (keyof User)[];

const cache = createCache("cps-global-components-cache");

// Create cache instance (this prunes on creation)
const userCache = cache.createEntityCache("user", UserSchema, {
  cacheableFields,
  maxAge: 1000 * 60 * 60 * 24, // Prune anything older than 24 hours on init
  maxItems: 50, // Keep max 50 users in cache
});

// Usage examples:

// 1. Get only public fields (will use cache if available)
export const getPublicUser = async (id: string) => {
  return userCache.fetch(
    id,
    async id => {
      const response = await fetch(`/api/users/${id}`);
      return response.json();
    },
    { fields: ["username", "publicBio", "avatar"] },
  );
};

// 2. Get all fields including PII (will always fetch fresh if PII requested)
export const getFullUser = async (id: string) => {
  return userCache.fetch(
    id,
    async id => {
      const response = await fetch(`/api/users/${id}`);
      return response.json();
    },
    { fields: ["username", "email", "ssn", "role"] },
  );
};

// 3. Force refresh even for cached fields
export const refreshUser = async (id: string) => {
  return userCache.fetch(
    id,
    async id => {
      const response = await fetch(`/api/users/${id}`);
      return response.json();
    },
    { forceRefresh: true },
  );
};

// 4. Invalidate specific user
export const logoutUser = (id: string) => {
  userCache.invalidate(id);
};

// 5. Clear all cached users
export const clearAllUserCache = () => {
  userCache.invalidateAll();
};

// TypeScript will enforce that fields are valid
// This would cause a TypeScript error:
// await userCache.fetch(id, fetcher, { fields: ['nonExistentField'] });

// The cache automatically:
// - Validates fetched data against the schema
// - Only caches non-PII fields
// - Respects TTL on reads
// - Prunes old entries each time the app loads
// - Returns only requested fields
