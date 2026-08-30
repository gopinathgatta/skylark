import type { BusinessDataSnapshot } from '../types';

const DEFAULT_TTL_MS = 3 * 60 * 1000; // 3 minutes

interface CacheEntry {
  data: BusinessDataSnapshot;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

export function getCacheTtlMs(): number {
  const configured = process.env.CACHE_TTL_MS;
  if (!configured) return DEFAULT_TTL_MS;

  const parsed = Number(configured);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS;
}

export function getCachedBusinessData(): BusinessDataSnapshot | null {
  if (!cache || Date.now() >= cache.expiresAt) {
    return null;
  }
  return cache.data;
}

export function setCachedBusinessData(data: BusinessDataSnapshot): void {
  cache = {
    data,
    expiresAt: Date.now() + getCacheTtlMs(),
  };
}

export function clearBusinessDataCache(): void {
  cache = null;
}

export function getCacheExpiresAt(): string | null {
  if (!cache || Date.now() >= cache.expiresAt) {
    return null;
  }
  return new Date(cache.expiresAt).toISOString();
}
