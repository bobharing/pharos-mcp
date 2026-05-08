# LHR Cache Implementation Plan

## Goal

Minimize redundant Lighthouse runs by caching full LHR results in memory. Subsequent tool calls for the same URL/device/throttling combination reuse cached data instead of launching Chrome again.

## Design

### Cache layer location

Inside `runRawLighthouseAudit()` in `src/lib/lighthouse.ts`. All tools already call this function — no tool-level changes needed for basic caching.

### Cache key

```
`${url}::${device}::${throttling}`
```

Server-wide config (profile path, chrome flags, chrome portz) is constant for the process lifetime and does not need to be part of the key.

### Cache entry

```ts
interface CacheEntry {
  lhr: LighthouseResult;
  timestamp: number;
}
```

### TTL

Default: 5 minutes (configurable via constant). Entries older than TTL are treated as misses and evicted lazily on access.

### Full-category runs

On a cache miss, always run **all categories** regardless of what the tool requested. This ensures any subsequent tool call can be served from cache. The `onlyCategories` parameter is only applied when there is no cache hit and the caller explicitly passes categories (preserving existing behavior for the smoke script).

### `forceFresh` parameter

Add an optional `forceFresh: boolean` field to all tool input schemas. When true, bypass the cache for that call and store the fresh result.

### Profile mode: no caching

When `isProfileConfig()` returns true, skip the cache entirely. Authenticated sessions produce user-specific results that must not be reused across requests.

---

## Implementation Steps

### Step 1: Add cache module — `src/lib/cache.ts`

- `Map<string, CacheEntry>` with helper functions:
  - `getCachedResult(key: string, ttlMs: number): LighthouseResult | null`
  - `setCachedResult(key: string, result: LighthouseResult): void`
  - `buildCacheKey(url: string, device: string, throttling: boolean): string`
  - `clearCache(): void` (for testing / future `pharos_clear_cache` tool)
- Lazy eviction: on `get`, check timestamp; if expired, delete and return null.

### Step 2: Modify `runRawLighthouseAudit()` in `src/lib/lighthouse.ts`

- Add optional parameter: `options?: { forceFresh?: boolean }`
- Before launching Chrome:
  1. If `isProfileConfig()` → skip cache, run normally
  2. Build cache key
  3. If not `forceFresh`, check cache → return on hit
- On miss: run with all categories (pass `undefined` for `onlyCategories`), store result in cache, return it

### Step 3: Add `forceFresh` to schemas — `src/schemas.ts`

- Add to `baseSchemas`:
  ```ts
  forceFresh: z.boolean().describe("Bypass cache and force a fresh Lighthouse run").default(false),
  ```
- Add `forceFresh` to each tool schema that uses `baseSchemas.url`

### Step 4: Thread `forceFresh` through tool handlers

- Each tool handler passes `forceFresh` into `runRawLighthouseAudit` (or the lib function that calls it)
- `findUnusedJavaScript`, `analyzeResources`, `getSecurityAudit`, `getAgenticAudit`, `getCoreWebVitals`, `compareMobileDesktop`, `getLcpOpportunities` all need to accept and forward this option

### Step 5: Update `compareMobileDesktop`

- Currently runs two sequential audits (mobile + desktop). Each should independently check/populate the cache.
- No special handling needed — two calls to `runRawLighthouseAudit` with different `device` values will naturally produce two cache entries.

### Step 6: Tests

- Unit test the cache module: hit, miss, expiry, forceFresh bypass, profile-mode skip
- Verify existing tool tests still pass (they mock `runRawLighthouseAudit` already)

---

## Files Modified

| File                       | Change                                                 |
| -------------------------- | ------------------------------------------------------ |
| `src/lib/cache.ts`         | **New** — cache map + helpers                          |
| `src/lib/lighthouse.ts`    | Check/populate cache in `runRawLighthouseAudit`        |
| `src/schemas.ts`           | Add `forceFresh` to `baseSchemas` and all tool schemas |
| `src/tools/audit.ts`       | Pass `forceFresh`                                      |
| `src/tools/performance.ts` | Pass `forceFresh`                                      |
| `src/tools/analysis.ts`    | Pass `forceFresh`                                      |
| `src/tools/security.ts`    | Pass `forceFresh`                                      |
| `src/tools/agentic.ts`     | Pass `forceFresh`                                      |
| `src/lib/analysis.ts`      | Accept + forward `forceFresh`                          |
| `src/lib/performance.ts`   | Accept + forward `forceFresh`                          |
| `src/lib/cache.test.ts`    | **New** — cache unit tests                             |

---

## Not in scope (future)

- `pharos_clear_cache` tool (expose cache reset to LLMs)
- Category-aware partial cache (only re-run missing categories)
- Persistent/disk cache across server restarts
- HTTP mode shared cache with per-session isolation
