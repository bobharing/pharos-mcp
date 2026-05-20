# Phase 3: MCP Server Compliance

## Objective

Align the server with MCP best practices from `mcp-server-instructions.md`: add server-level instructions, add tool annotations to every tool, and prefix all tool names with `pharos_`.

## Prerequisites

- Phase 2 complete (Bun migration done, `.ts` imports working)

## Files to Modify

- `src/index.ts` — add instructions to McpServer constructor
- `src/tools/audit.ts` — rename tools, add annotations
- `src/tools/performance.ts` — rename tools, add annotations
- `src/tools/analysis.ts` — rename tools, add annotations
- `src/tools/security.ts` — rename tools, add annotations
- `src/schemas.ts` — no changes needed

## Implementation

### Step 1: Add shared annotation constants

Create or add to an appropriate shared location (e.g., top of `src/tools/index.ts` or a new `src/tools/annotations.ts`):

```typescript
export const READ_ONLY_OPEN = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true, // tools access external URLs via Chrome
} as const;
```

### Step 2: Add server instructions in `src/index.ts`

```typescript
const server = new McpServer(
  { name: "Pharos", version: packageJson.version },
  {
    instructions: `Pharos is a Lighthouse-powered web auditing server. Each tool launches Chrome headlessly to audit a URL — expect 5-15 seconds per call.

WORKFLOW:
1. Start with pharos_audit for a full overview of all categories
2. Drill into specifics: pharos_performance, pharos_core_web_vitals, pharos_security
3. Use pharos_resources or pharos_lcp for optimization opportunities
4. Use pharos_compare_devices to compare mobile vs desktop

All tools accept a URL and optional device (desktop/mobile). Results include scores, metrics, and actionable recommendations.`,
  },
);
```

### Step 3: Rename tools and add annotations

Apply to every `server.registerTool()` call:

**Naming convention:** `pharos_{verb}_{noun}` or `pharos_{noun}`

| Current Name | New Name |
|-------------|----------|
| `run_audit` | `pharos_audit` |
| `get_accessibility_score` | `pharos_accessibility` |
| `get_seo_analysis` | `pharos_seo` |
| `check_pwa_readiness` | `pharos_pwa` |
| `get_performance_score` | `pharos_performance` |
| `get_core_web_vitals` | `pharos_core_web_vitals` |
| `compare_mobile_desktop` | `pharos_compare_devices` |
| `check_performance_budget` | `pharos_performance_budget` |
| `get_lcp_opportunities` | `pharos_lcp` |
| `find_unused_javascript` | `pharos_unused_js` |
| `analyze_resources` | `pharos_resources` |
| `get_security_audit` | `pharos_security` |

**Annotation pattern** — add to every tool registration:

```typescript
server.registerTool(
  "pharos_audit",
  {
    description: "Run a comprehensive Lighthouse audit on a website. Returns scores for performance, accessibility, SEO, best-practices, and PWA categories plus key metrics. Call this first for a full overview.",
    inputSchema: auditParamsSchema,
    annotations: READ_ONLY_OPEN,
  },
  async ({ url, categories, device, throttling }) => { /* ... */ },
);
```

### Step 4: Improve tool descriptions

Each description should:
- State what the tool does
- Mention when to use it relative to other tools
- Note any important behavior (e.g., "takes 5-15 seconds")

Examples:

```typescript
// pharos_audit
"STEP 1 — Run a comprehensive Lighthouse audit. Returns category scores and key metrics. Start here for a full overview, then drill into specific areas with other tools."

// pharos_performance
"Get detailed performance score and metrics. Use after pharos_audit if you need deeper performance data."

// pharos_core_web_vitals
"Get Core Web Vitals (LCP, FCP, CLS, TBT) with optional threshold checking. Use when you need to validate against specific performance targets."

// pharos_compare_devices
"Compare performance between mobile and desktop. Runs two sequential audits — takes 10-30 seconds."

// pharos_security
"Security audit checking HTTPS, HTTP/2, CSP, and vulnerable libraries. Uses Lighthouse best-practices category."

// pharos_resources
"Analyze page resources (images, JS, CSS, fonts) by type and size. Use to find optimization opportunities."

// pharos_unused_js
"Find unused JavaScript code that can be removed to reduce bundle size."

// pharos_lcp
"Get LCP optimization opportunities. Use when LCP exceeds thresholds."
```

### Step 5: Update tool descriptions to reference new names

Any description that mentions another tool name should use the new `pharos_*` prefix.

## Acceptance Criteria

- [ ] All 12 tools have `annotations` with `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`
- [ ] All tool names start with `pharos_`
- [ ] Server has `instructions` string in constructor
- [ ] Tool descriptions mention related tools by their new names
- [ ] No tool name contains generic verbs without the prefix (no `run_audit`, `get_*`)
- [ ] TypeScript compiles cleanly
- [ ] Tests pass (update test assertions that reference old tool names if any)

## Notes

- Tool renaming is a breaking change for any existing clients. Since this is a fork/rewrite, that's acceptable.
- The `annotations` tell MCP clients that these tools are read-only and access external systems — important for trust/safety UIs.
