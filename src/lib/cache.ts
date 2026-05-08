import { LighthouseResult } from "../types.ts";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  lhr: LighthouseResult;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

// Proactively evict expired entries so the map doesn't grow unboundedly in long-running servers.
// unref() ensures the timer never prevents the process from exiting cleanly.
const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}, CACHE_TTL_MS);
sweepInterval.unref();

export function buildCacheKey(url: string, device: string, throttling: boolean): string {
  return `${url}::${device}::${throttling}`;
}

export function getCachedResult(key: string, ttlMs = CACHE_TTL_MS): LighthouseResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp >= ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.lhr;
}

export function setCachedResult(key: string, result: LighthouseResult): void {
  cache.set(key, { lhr: result, timestamp: Date.now() });
}

export function clearCache(): void {
  cache.clear();
}
