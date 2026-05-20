import { describe, it, expect, beforeEach } from "bun:test";
import { buildCacheKey, getCachedResult, setCachedResult, clearCache } from "./cache";
import type { LighthouseResult } from "../types";

function makeFakeResult(url = "https://example.com"): LighthouseResult {
  return {
    lhr: {
      finalDisplayedUrl: url,
      fetchTime: new Date().toISOString(),
      lighthouseVersion: "12.0.0",
      userAgent: "test",
      categories: {},
      audits: {},
    },
  } as unknown as LighthouseResult;
}

describe("cache", () => {
  beforeEach(() => {
    clearCache();
  });

  describe("buildCacheKey", () => {
    it("should build key from url, device, and throttling", () => {
      const key = buildCacheKey("https://example.com", "desktop", false);
      expect(key).toBe("https://example.com::desktop::false");
    });

    it("should distinguish device and throttling variants", () => {
      const a = buildCacheKey("https://example.com", "desktop", false);
      const b = buildCacheKey("https://example.com", "mobile", false);
      const c = buildCacheKey("https://example.com", "desktop", true);
      expect(a).not.toBe(b);
      expect(a).not.toBe(c);
      expect(b).not.toBe(c);
    });
  });

  describe("getCachedResult / setCachedResult", () => {
    it("returns null on cache miss", () => {
      expect(getCachedResult("missing-key")).toBeNull();
    });

    it("returns stored result on cache hit", () => {
      const result = makeFakeResult();
      const key = buildCacheKey("https://example.com", "desktop", false);
      setCachedResult(key, result);
      expect(getCachedResult(key)).toEqual(result);
    });

    it("returns null and evicts entry after TTL expires", () => {
      const result = makeFakeResult();
      const key = buildCacheKey("https://example.com", "desktop", false);
      setCachedResult(key, result);
      // Use a TTL of 0 so the entry is immediately expired
      expect(getCachedResult(key, 0)).toBeNull();
    });

    it("does not return entry to a second call after TTL eviction", () => {
      const result = makeFakeResult();
      const key = buildCacheKey("https://example.com", "desktop", false);
      setCachedResult(key, result);
      getCachedResult(key, 0); // evict
      expect(getCachedResult(key)).toBeNull();
    });

    it("uses the default TTL when no ttl argument is supplied", () => {
      const result = makeFakeResult();
      const key = buildCacheKey("https://example.com", "desktop", false);
      setCachedResult(key, result);
      // Fresh entry should still be present within default TTL
      expect(getCachedResult(key)).toEqual(result);
    });
  });

  describe("clearCache", () => {
    it("removes all entries", () => {
      const key1 = buildCacheKey("https://a.com", "desktop", false);
      const key2 = buildCacheKey("https://b.com", "mobile", true);
      setCachedResult(key1, makeFakeResult("https://a.com"));
      setCachedResult(key2, makeFakeResult("https://b.com"));
      clearCache();
      expect(getCachedResult(key1)).toBeNull();
      expect(getCachedResult(key2)).toBeNull();
    });
  });
});
