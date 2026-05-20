# Phase 5: Code Quality & Token Efficiency

## Objective

Extract shared utilities to eliminate duplicated code, improve response token efficiency, and restructure files to separate I/O from logic per MCP guidelines.

## Prerequisites

- Phase 4 complete (tools consolidated to 8)

## Implementation

### Step 1: Create shared error response utility

Every tool handler has a near-identical catch block. Extract into a shared utility.

Create `src/lib/responses.ts`:

```typescript
import type { McpToolResponse } from "./types.ts";

export function errorResponse(
  errorType: string,
  context: Record<string, unknown>,
  error: unknown,
): McpToolResponse {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ error: errorType, message, ...context }),
    }],
    isError: true,
  };
}

export function successResponse(data: unknown): McpToolResponse {
  return {
    content: [{
      type: "text",
      text: JSON.stringify(data),
    }],
  };
}
```

Then in tool handlers:
```typescript
// Before (repeated 12+ times)
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: "...", url, device, message: errorMessage }, null, 2) }],
    isError: true,
  };
}

// After
} catch (error) {
  return errorResponse("Lighthouse audit failed", { url, device }, error);
}
```

### Step 2: Remove `JSON.stringify(…, null, 2)` — use compact JSON

Every response currently uses `null, 2` (pretty-printed). This wastes tokens in the agent's context window.

Replace all:
```typescript
JSON.stringify(result, null, 2)
```
With:
```typescript
JSON.stringify(result)
```

Agents parse JSON programmatically — whitespace provides zero value and costs ~30% extra tokens.

### Step 3: Remove duplicated `StructuredResponse` interfaces

`src/tools/audit.ts`, `src/tools/performance.ts`, and `src/tools/security.ts` each define their own identical:
```typescript
interface StructuredResponse {
  summary: string;
  data: Record<string, unknown>;
  recommendations?: string[];
}
```

And their own `createStructured*` helper. After Phase 4's consolidation, determine if this pattern is still needed. If so, move to a single shared location. If the `successResponse` utility from Step 1 replaces it, delete entirely.

### Step 4: Restructure into `lib/` directory

Move pure logic files into `src/lib/`:

```
src/
├── index.ts                  # Entry point (I/O only)
├── lib/
│   ├── chrome.ts             # Was: chrome-config.ts
│   ├── lighthouse.ts         # Was: lighthouse-core.ts
│   ├── constants.ts          # Was: lighthouse-constants.ts
│   ├── performance.ts        # Was: lighthouse-performance.ts
│   ├── analysis.ts           # Was: lighthouse-analysis.ts
│   ├── categories.ts         # Was: lighthouse-categories.ts (if still needed)
│   └── responses.ts          # New: shared response utilities
├── tools/
│   └── index.ts              # Tool registration (thin)
├── schemas.ts
└── types.ts
```

Update all imports accordingly.

### Step 5: Remove `as const` type assertions on `"text"` literals

Every response has:
```typescript
type: "text" as const,
```

If using the `successResponse` utility, this is handled internally. For any remaining manual responses, TypeScript should infer this from the return type — remove the `as const` assertions if the types already constrain it.

### Step 6: Simplify `Object.fromEntries(Object.entries(...).map(...))` patterns

Multiple handlers do:
```typescript
const categories = Object.fromEntries(
  Object.entries(result.categories).map(([key, category]) => [
    key,
    { title: category.title, score: category.score },
  ]),
);
```

Replace with direct object construction:
```typescript
const categories: Record<string, { title: string; score: number }> = {};
for (const [key, category] of Object.entries(result.categories)) {
  categories[key] = { title: category.title, score: category.score };
}
```

This is slightly more performant (no intermediate array allocation) and more readable.

### Step 7: Add stderr logging for startup

Per MCP guidelines, use `process.stderr.write()` for logging:

```typescript
// In src/index.ts, after server connects:
process.stderr.write(`Pharos MCP server v${packageJson.version} started\n`);
```

Never use `console.log` — stdout must stay clean for stdio transport.

## Acceptance Criteria

- [ ] No duplicated `StructuredResponse` interface or `createStructured*` helpers
- [ ] All error handling uses the shared `errorResponse` utility
- [ ] No `JSON.stringify(…, null, 2)` in any tool response (compact JSON only)
- [ ] Pure logic lives in `src/lib/` — no MCP SDK imports in `lib/` files
- [ ] `src/tools/` contains only tool registration (thin wrappers calling lib functions)
- [ ] Server logs startup to stderr
- [ ] TypeScript compiles cleanly
- [ ] All tests pass

## Token Efficiency Impact

Rough estimate:
- Removing pretty-print whitespace: ~30% fewer tokens per response
- Removing duplicate `recommendations` arrays (generic static advice): ~15% fewer tokens
- More compact response structure: ~10% fewer tokens

Combined: ~40-50% reduction in tokens per tool response.
