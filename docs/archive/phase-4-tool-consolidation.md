# Phase 4: Tool Consolidation

## Objective

Reduce the tool count from 12 to 8 by merging overlapping tools. Fewer, more capable tools improve agent accuracy per MCP guidelines ("fewer tools > more tools").

## Prerequisites

- Phase 3 complete (tools already renamed to `pharos_*`)

## Rationale for Merging

| Remove | Absorb Into | Reason |
|--------|-------------|--------|
| `pharos_accessibility` | `pharos_audit` | `pharos_audit` already returns accessibility score; details can be a parameter |
| `pharos_seo` | `pharos_audit` | Same — `pharos_audit` returns SEO score |
| `pharos_pwa` | `pharos_audit` | Same — `pharos_audit` returns PWA score |
| `pharos_performance_budget` | `pharos_performance` | Natural extension of performance analysis |

## Final Tool Set (8 tools)

1. **`pharos_audit`** — Full audit with optional detail expansion per category
2. **`pharos_performance`** — Performance score + optional budget checking
3. **`pharos_core_web_vitals`** — CWV metrics with threshold validation
4. **`pharos_compare_devices`** — Mobile vs desktop comparison
5. **`pharos_security`** — Security audit
6. **`pharos_resources`** — Resource analysis by type/size
7. **`pharos_unused_js`** — Unused JavaScript detection
8. **`pharos_lcp`** — LCP optimization opportunities

## Implementation

### Step 1: Expand `pharos_audit` schema

Add an optional `includeDetails` parameter and optional `focusCategory` parameter:

```typescript
export const auditParamsSchema = z.object({
  url: baseSchemas.url,
  categories: baseSchemas.categories,
  device: baseSchemas.device,
  throttling: baseSchemas.throttling,
  includeDetails: z.boolean()
    .describe("Include detailed per-audit breakdowns for each category")
    .default(false),
  focusCategory: z.enum(["performance", "accessibility", "best-practices", "seo", "pwa"])
    .optional()
    .describe("If set, return detailed audits only for this category"),
});
```

### Step 2: Update `pharos_audit` handler

When `includeDetails` or `focusCategory` is set, include the detailed audit breakdowns in the response (using `filterAuditsByCategory` from the same LHR — no extra Lighthouse run needed since Phase 1 fixed this).

```typescript
async ({ url, categories, device, throttling, includeDetails, focusCategory }) => {
  const runnerResult = await runRawLighthouseAudit(url, categories, device, throttling);
  const { lhr } = runnerResult;

  const result = {
    url: lhr.finalDisplayedUrl,
    fetchTime: lhr.fetchTime,
    categories: formatCategoryScores(lhr),
    metrics: extractKeyMetrics(lhr),
  };

  if (includeDetails || focusCategory) {
    const targetCategories = focusCategory ? [focusCategory] : Object.keys(lhr.categories);
    result.detailedAudits = {};
    for (const cat of targetCategories) {
      result.detailedAudits[cat] = filterAuditsByCategory(lhr, cat);
    }
  }

  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}
```

### Step 3: Expand `pharos_performance` to include budget checking

Merge `pharos_performance_budget` into `pharos_performance` with an optional `budget` parameter:

```typescript
export const performanceSchema = z.object({
  url: baseSchemas.url,
  device: baseSchemas.device,
  budget: z.object({
    performanceScore: z.number().min(0).max(100).optional(),
    firstContentfulPaint: z.number().min(0).optional().describe("FCP budget in ms"),
    largestContentfulPaint: z.number().min(0).optional().describe("LCP budget in ms"),
    totalBlockingTime: z.number().min(0).optional().describe("TBT budget in ms"),
    cumulativeLayoutShift: z.number().min(0).optional().describe("CLS budget"),
    speedIndex: z.number().min(0).optional().describe("Speed Index budget in ms"),
  }).optional().describe("If provided, checks metrics against budget thresholds"),
});
```

Handler returns performance data always, plus budget pass/fail results when `budget` is provided.

### Step 4: Remove merged tools

Delete the following tool registrations:
- `pharos_accessibility` (from `audit.ts`)
- `pharos_seo` (from `audit.ts`)
- `pharos_pwa` (from `audit.ts`)
- `pharos_performance_budget` (from `performance.ts`)

### Step 5: Remove dead code

After removing tool registrations, check if any functions in `lighthouse-categories.ts` or `lighthouse-performance.ts` are now unused. Remove:
- `getAccessibilityScore` (if only used by the removed tool)
- `getSeoAnalysis` (if only used by the removed tool)
- `checkPwaReadiness` (if only used by the removed tool)
- `checkPerformanceBudget` (if merged into performance handler)

Or refactor them into the consolidated handlers if they still provide useful logic.

### Step 6: Update server instructions

Update the `instructions` text in `src/index.ts` to reflect the new 8-tool set:

```typescript
instructions: `Pharos is a Lighthouse-powered web auditing server. Each tool launches Chrome to audit a URL (5-15 seconds per call).

WORKFLOW:
1. pharos_audit — Full overview of all categories (use focusCategory for details on one area)
2. pharos_performance — Detailed performance with optional budget checking
3. pharos_core_web_vitals — Core Web Vitals with threshold validation
4. pharos_compare_devices — Mobile vs desktop (runs two audits, 10-30s)
5. pharos_security — HTTPS, CSP, HTTP/2, vulnerability checks
6. pharos_resources — Resource breakdown by type and size
7. pharos_unused_js — Find removable JavaScript
8. pharos_lcp — LCP optimization opportunities`
```

### Step 7: Update tool descriptions to cross-reference correctly

Ensure no description references a removed tool name.

## Acceptance Criteria

- [ ] Exactly 8 tools registered (verify by counting `server.registerTool` calls)
- [ ] `pharos_audit` with `focusCategory: "accessibility"` returns the same data that `pharos_accessibility` used to
- [ ] `pharos_performance` with `budget: { ... }` returns the same data that `pharos_performance_budget` used to
- [ ] No dead/unreachable code remains
- [ ] Tests updated to cover new consolidated tool behavior
- [ ] TypeScript compiles cleanly

## Notes

- This is a breaking change for tool names/schemas. Since this is a rewrite, that's expected.
- The consolidated tools are more capable (more parameters) but the defaults match the simple case — so basic usage is unchanged.
- Prompts in `prompts.ts` don't reference tool names directly, so they don't need updating.
