# Phase 1: Fix Duplicate Lighthouse Runs

## Objective

Eliminate redundant Lighthouse audit executions in `src/lighthouse-categories.ts`. Currently, when `includeDetails=true`, the functions `getAccessibilityScore`, `getSeoAnalysis`, and `checkPwaReadiness` each run Lighthouse **twice** — once for the summary and once for detailed audits. Both runs use identical parameters. Fix this to use a single run.

## Context

- `runLighthouseAudit()` in `lighthouse-core.ts` calls `runRawLighthouseAudit()` internally, then formats the result (discarding the raw LHR).
- `getDetailedAuditResults()` in `lighthouse-core.ts` also calls `runRawLighthouseAudit()` and then uses `filterAuditsByCategory()` on the raw LHR.
- Both functions already exist and work — the fix is to call `runRawLighthouseAudit()` once and extract both summary and detail from that single result.

## Files to Modify

- `src/lighthouse-categories.ts` — main changes
- `src/lighthouse-core.ts` — may need to export `formatCategoryScores` and `extractKeyMetrics` if not already (they are already exported)

## Implementation

### Step 1: Refactor `getAccessibilityScore`

Replace:
```typescript
export async function getAccessibilityScore(url, device, includeDetails) {
  const result = await runLighthouseAudit(url, ["accessibility"], device);
  const categoryData = result.categories.accessibility;
  const baseData = { /* ... */ };

  if (includeDetails) {
    const { audits } = await getDetailedAuditResults(url, "accessibility", device);
    return { ...baseData, audits };
  }
  return baseData;
}
```

With:
```typescript
export async function getAccessibilityScore(url, device, includeDetails) {
  const runnerResult = await runRawLighthouseAudit(url, ["accessibility"], device);
  const { lhr } = runnerResult;

  const categories = formatCategoryScores(lhr);
  const categoryData = categories.accessibility;

  const baseData = {
    url: lhr.finalDisplayedUrl,
    device,
    accessibilityScore: categoryData?.score || 0,
    fetchTime: lhr.fetchTime,
  };

  if (includeDetails) {
    const audits = filterAuditsByCategory(lhr, "accessibility");
    return { ...baseData, audits };
  }
  return baseData;
}
```

### Step 2: Apply same pattern to `getSeoAnalysis`

Same refactor — use `runRawLighthouseAudit` once, extract `seoScore` from `formatCategoryScores`, get audits from `filterAuditsByCategory` if `includeDetails`.

### Step 3: Apply same pattern to `checkPwaReadiness`

Same refactor — use `runRawLighthouseAudit` once, extract `pwaScore` from `formatCategoryScores`, get audits from `filterAuditsByCategory` if `includeDetails`.

### Step 4: Update imports in `lighthouse-categories.ts`

Change:
```typescript
import { runLighthouseAudit, getDetailedAuditResults } from "./lighthouse-core.js";
```
To:
```typescript
import { runRawLighthouseAudit, formatCategoryScores, filterAuditsByCategory } from "./lighthouse-core.js";
```

## Acceptance Criteria

- [ ] Each of the 3 functions calls `runRawLighthouseAudit` exactly once (no second call)
- [ ] `getDetailedAuditResults` is no longer imported in `lighthouse-categories.ts`
- [ ] All existing tests pass: `npx vitest run`
- [ ] The return shape of each function is identical to before (no breaking changes to tool handlers)
- [ ] TypeScript compiles cleanly: `npx tsc --noEmit`

## Testing

Run the existing test suite:
```bash
npx vitest run src/lighthouse-categories.test.ts
npx vitest run src/tools/audit.test.ts
```

If tests mock `runLighthouseAudit`, they may need updating to mock `runRawLighthouseAudit` instead. Ensure mocks return a proper `{ lhr: { ... } }` shape.

## Risk

Low — this is a pure refactor. The output shape doesn't change, only the internal execution path.
