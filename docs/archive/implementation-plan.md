# Pharos MCP — Bun Migration & Improvement Analysis

## Executive Summary

This is a fork of `@danielsogl/lighthouse-mcp` (v1.5.0) — an MCP server that wraps Google Lighthouse for web performance auditing. The codebase is well-structured and contains **no malicious code**. The plan below covers a full rewrite to run on Bun, alignment with MCP server best practices, and performance improvements.

---

## 1. Security & Malicious Code Audit

### Verdict: ✅ CLEAN — No malicious code detected

| Check | Result |
|-------|--------|
| Source code telemetry/tracking | None — no Sentry, analytics, or beacon code in `src/` |
| Network calls | Only to Chrome via chrome-launcher (local) and Lighthouse auditing (user-provided URLs) |
| File system access | Only reads `package.json` for version and optionally creates Chrome user-data directories |
| Dependencies (runtime) | 4 direct: `@modelcontextprotocol/sdk`, `chrome-launcher`, `lighthouse`, `zod` |
| Transitive concern | Lighthouse pulls in `@sentry/node` (telemetry for Lighthouse's own crash reporting) — NOT used by this server's code |
| Supply chain | All packages resolve to `registry.npmjs.org` — no private registries or git URLs |
| `postinstall` scripts | Only `husky` (dev-only) |

### Recommendation
- The `@sentry/node` + OpenTelemetry tree (pulled by Lighthouse) adds ~284 transitive runtime packages. This is normal for Lighthouse but worth noting — you inherit its dependency surface.
- Consider pinning Lighthouse to a specific minor version to avoid surprise dependency changes.

---

## 2. Architecture Assessment (vs MCP Server Instructions)

### What the current code does well
- ✅ ESM modules (`"type": "module"`)
- ✅ Zod schemas for input validation
- ✅ Error handling returns `isError: true` (never throws from handlers)
- ✅ Actionable error messages with troubleshooting steps
- ✅ URL validation rejects non-HTTP protocols
- ✅ Stateless pattern (each tool call launches Chrome, runs audit, kills Chrome)

### Gaps vs MCP Server Instructions

| Guideline | Current State | Fix |
|-----------|--------------|-----|
| Separate I/O from logic | Mixed — tool handlers contain JSON formatting logic | Extract pure handler functions into `lib/handlers.ts` |
| Server-level `instructions` | Missing — `McpServer` constructed without instructions | Add instructions explaining tool workflow |
| Tool annotations | Missing — no `readOnlyHint`, `idempotentHint`, etc. | Add annotations to all tools |
| Tool naming prefix | No prefix — tools named `run_audit`, `get_performance_score` | Prefix with `lighthouse_` or `pharos_` |
| Logging | Not observed — no stderr logging | Add `process.stderr.write()` for startup/error logging |
| Progressive disclosure | Partially — tools exist but no discovery/orientation tool | Add a `pharos_overview` tool |
| `JSON.stringify(…, null, 2)` in responses | Wastes tokens with whitespace | Use compact JSON or structured text |

---

## 3. Bun Migration Plan

### What changes for Bun

| Area | Node.js (current) | Bun (target) |
|------|-------------------|--------------|
| Runtime | `node dist/index.js` | `bun run src/index.ts` (direct TS execution) |
| Build step | `tsc` compiles to `dist/` | **Optional** — Bun runs TS directly; use `bun build` for publishing |
| Package manager | npm + package-lock.json | `bun install` + `bun.lock` |
| Test runner | Vitest | `bun:test` (built-in, Vitest-compatible API) |
| File imports | `.js` extensions (Node16 resolution) | `.ts` extensions (Bun native) |
| `__dirname` hack | `dirname(fileURLToPath(import.meta.url))` | `import.meta.dir` (Bun built-in) |
| CLI arg parsing | `node:util` `parseArgs` | Same — Bun supports `node:util` |
| Process shebang | `#!/usr/bin/env node` | `#!/usr/bin/env bun` |
| tsconfig module | `"module": "Node16"` | `"module": "ESNext"`, `"moduleResolution": "bundler"` |
| HTTP transport | Not yet implemented | `Bun.serve()` for Streamable HTTP |

### Key Bun compatibility notes
- `chrome-launcher` uses `child_process` — fully supported by Bun.
- `lighthouse` is a large Node.js package — **requires testing** under Bun. It uses `puppeteer-core` internally which should work but may have edge cases.
- `@modelcontextprotocol/sdk` is pure JS/TS — works fine on Bun.
- `zod` v4 — fully compatible.

### Migration steps

1. **Remove build step** — run TS directly with `bun run src/index.ts`
2. **Switch imports** to `.ts` extensions
3. **Replace `package-lock.json`** with `bun.lock` (`bun install`)
4. **Simplify `tsconfig.json`** — remove Node16 specifics, target ESNext
5. **Replace Vitest** with `bun:test` (same `describe/it/expect` API)
6. **Replace `__dirname` pattern** with `import.meta.dir`
7. **Add `Bun.serve()` transport option** for HTTP mode
8. **Remove dev dependencies** no longer needed: `tsx`, `vitest`, `@vitest/coverage-v8`, `@vitest/ui`
9. **Update `package.json` scripts** to use `bun` commands
10. **Test Lighthouse execution** end-to-end under Bun

---

## 4. Performance Improvements

### 4.1 Chrome lifecycle — intentional design (NO CHANGE)

The current approach of launching/killing Chrome per tool call is **intentional**. Lighthouse requires a clean browser state (no cached service workers, cookies, localStorage) for accurate measurements. Killing Chrome between runs ensures measurement isolation.

The codebase already provides an opt-in reuse path via `--chrome-port` / `--remote-debugging-port` flags, which lets users point at a persistent Chrome instance when they prefer speed over isolation. No change needed here.

### 4.2 Duplicate audit runs (HIGH impact)

**Problem:** `getAccessibilityScore` with `includeDetails=true` runs Lighthouse **twice** — once via `runLighthouseAudit` and again via `getDetailedAuditResults`. Same for SEO and PWA. Both calls hit the same URL with identical parameters; the only difference is what's *extracted* from the result. The raw LHR from the first run already contains everything needed — it's discarded by `runLighthouseAudit`'s formatting. This is a code organization shortcut, not an intentional accuracy choice.

**Fix:** Use a single `runRawLighthouseAudit` call and extract both summary and detailed audits from the one result:
```typescript
export async function getAccessibilityScore(url, device, includeDetails) {
  const runnerResult = await runRawLighthouseAudit(url, ["accessibility"], device);
  const { lhr } = runnerResult;
  const score = formatCategoryScores(lhr);
  const audits = includeDetails ? filterAuditsByCategory(lhr, "accessibility") : undefined;
  // Return both from single run
}
```

### 4.3 Token efficiency (MEDIUM impact)

**Problem:** Responses use `JSON.stringify(…, null, 2)` — indentation wastes agent context tokens.

**Fix:** Use compact JSON or structured plain-text summaries:
```typescript
// Before: ~2KB per response with whitespace
JSON.stringify(result, null, 2)

// After: ~800 bytes compact
JSON.stringify(result)
```

### 4.4 Unnecessary `Object.fromEntries(Object.entries(...).map(...))` (LOW impact)

**Problem:** Multiple tool handlers rebuild objects by converting to entries and back. This is O(n) allocation for what could be done in a simple loop.

**Fix:** Use `for...of` loops that build the result object directly.

### 4.5 Bun-specific gains

- **Startup time:** Bun starts ~4x faster than Node.js — matters for stdio MCP servers (new instance per client connection).
- **Native Bun.serve():** For HTTP transport, Bun's built-in HTTP server is significantly faster than Express/Hono.
- **No transpile step:** Eliminates the `tsc` build entirely for development.

---

## 5. Code Quality Improvements

### 5.1 Eliminate duplicated `StructuredResponse` types and `createStructured*` helpers
Each tool file defines its own identical `StructuredResponse` interface and `createStructured*` function. Consolidate into a single shared utility.

### 5.2 Generic error handler
Every tool handler has an identical `catch` block. Extract a shared `createErrorResponse(type, url, device, error)` utility.

### 5.3 Tool count reduction
The server exposes **13 tools**. Per MCP guidelines, "fewer tools > more tools." Several tools overlap:
- `run_audit` already returns accessibility/SEO/PWA scores
- `get_accessibility_score`, `get_seo_analysis`, `check_pwa_readiness` are subsets of `run_audit`

**Recommendation:** Consolidate to ~7-8 tools:
1. `pharos_audit` — full audit (replaces `run_audit`)
2. `pharos_performance` — performance metrics + budget check
3. `pharos_core_web_vitals` — CWV with thresholds
4. `pharos_compare_devices` — mobile vs desktop
5. `pharos_security` — security audit
6. `pharos_resources` — resource analysis + unused JS
7. `pharos_lcp` — LCP opportunities
8. `pharos_overview` — discovery tool (server capabilities, available checks)

### 5.4 Add server instructions
```typescript
const server = new McpServer(
  { name: "Pharos", version },
  {
    instructions: `Pharos provides Lighthouse-based web auditing. 
Start with pharos_audit for a full overview, then drill into specific areas.
Tools run Chrome headlessly — each call takes 5-15 seconds.`,
  }
);
```

### 5.5 Add tool annotations
```typescript
const READ_ONLY_OPEN = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true, // accesses external URLs
} as const;
```

---

## 6. Proposed File Structure (Post-Rewrite)

```
src/
├── index.ts              # Entry: parse args, register tools, connect transport
├── lib/
│   ├── chrome.ts         # Chrome lifecycle (pooling, launch, kill)
│   ├── lighthouse.ts     # Core Lighthouse runner
│   ├── handlers.ts       # Pure handler functions (no MCP deps)
│   ├── formatters.ts     # Response formatting utilities
│   └── constants.ts      # Config constants
├── tools/
│   └── index.ts          # Tool registration (thin wrappers calling handlers)
├── schemas.ts            # Zod schemas
└── types.ts              # TypeScript interfaces
test/
├── handlers.test.ts      # Unit tests for pure logic
├── chrome.test.ts        # Chrome config tests
└── schemas.test.ts       # Schema validation tests
```

---

## 7. Implementation Priority

| Priority | Task | Impact |
|----------|------|--------|
| 1 | Fix duplicate Lighthouse runs (categories.ts) | Halves audit time for detail requests |
| 2 | Bun migration — runtime, imports, tsconfig | Enables all Bun benefits |
| 3 | Add server instructions + tool annotations | MCP compliance |
| 4 | Consolidate tools (13 → 8) | Better agent accuracy |
| 5 | Extract shared error/response utilities | Code quality |
| 6 | Compact JSON responses | Token efficiency |
| 7 | Add Bun.serve() HTTP transport option | Remote/shared usage |
| 8 | Replace Vitest with bun:test | Simplify toolchain |
| 9 | Remove unused dev dependencies | Smaller install |

---

## 8. Risks & Considerations

1. **Lighthouse + Bun compatibility:** Lighthouse is a complex Node.js package. While Bun's Node.js compatibility is excellent, some edge cases may exist with puppeteer-core's process spawning. Needs end-to-end validation.

2. **chrome-launcher on Windows:** Works fine on both Node and Bun, but test with your specific Chrome installation.

3. **Publishing:** If you intend to publish to npm, you'll still need a build step (`bun build`) since consumers may use Node.js. If it's personal use only, skip the build entirely.

4. **MCP SDK version:** Currently using `^1.29.0`. The SDK is actively evolving — pin to exact version if stability matters.
