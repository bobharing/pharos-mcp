# MCP Server Development — Instructions & Boilerplate

Use this document as a guide when building any new MCP server. It codifies proven patterns and conventions into actionable rules.

---

## Choose Your Architecture

MCP servers fall into two primary patterns. Pick the one that fits, or combine them.

| Question                           | Pre-indexed                   | Stateless                |
| ---------------------------------- | ----------------------------- | ------------------------ |
| Data known at startup?             | Yes — files, specs, databases | No — provided per call   |
| Freshness needed per call?         | No (or explicit reload tool)  | Yes — always live        |
| Startup cost acceptable?           | Yes                           | Must be near-zero        |
| Per-call recomputation acceptable? | No — must be O(1)             | Yes — bounded and capped |

**Pre-indexed** (e.g., iis-logs-mcp, OpenAPI-MCP): load data → build indexes → tool calls are cheap lookups.

**Stateless** (e.g., svg-opti-detector): no startup data — each tool call receives input, processes it, and returns results.

**Hybrid** — a pre-indexed server that caches data to disk (e.g., bun-doc-mcp downloads docs at startup, builds an index, and serves from cache). Follow the pre-indexed pattern with the addition of cache lifecycle management.

---

## Project Structure

Adapt to your server's complexity. Two common layouts:

**Flat** — small to mid-size servers:

```
src/
├── index.ts     # Entry point: I/O, loading, tool registration, transport
├── lib.ts       # Pure logic: handlers, indexing, search (NO side effects)
└── types.ts     # TypeScript interfaces (optional — can inline in lib.ts)
test/
└── lib.test.ts  # Unit tests against lib.ts using a self-contained mock fixture
```

**Subdirectory** — when logic naturally separates (e.g., CLI + MCP dual mode):

```
src/
├── core/        # Domain logic (parsing, analysis, optimization)
├── mcp/         # MCP entry point, tool registration, handlers
│   ├── index.ts
│   └── handlers.ts
├── cli/         # CLI entry point (optional — dual CLI + MCP mode)
└── types.ts
```

Use ESM modules (`"type": "module"` in `package.json`). Import with `.ts` extensions when using Bun.

---

## Universal Architecture Rules

These rules apply to every MCP server regardless of pattern.

### 1. Separate I/O from logic — this is non-negotiable

- **Entry point** (`index.ts`) handles ONLY: loading input, registering tools, connecting transport.
- **Logic modules** (`lib.ts`, `handlers.ts`, `core/`) contain pure functions. Every exported function takes dependencies as parameters and returns a result.
- Side effects (file reads, network calls, process management, MCP setup) NEVER appear in logic modules.

### 2. Handler contract

Every tool handler returns an `McpToolResponse`. Handlers NEVER throw.

```typescript
// Success
{ content: [{ type: "text", text: "..." }] }

// Error — use isError: true so agents can distinguish failures from results
{ content: [{ type: "text", text: "..." }], isError: true }
```

### 3. Server-level instructions

Use the `instructions` option on `McpServer` to provide global orientation — what the server does, how to use it, and domain-specific rules. Use tool descriptions for per-tool behavior.

```typescript
const server = new McpServer(
  { name: "my-server", version: "1.0.0" },
  {
    instructions:
      "This server provides access to X. Start with my_list to discover available items...",
  },
);
```

### 4. Tool annotations

Set annotations on every tool to signal behavior to clients:

```typescript
annotations: {
	readOnlyHint: true,     // tool doesn't modify state
	destructiveHint: false, // tool doesn't destroy data
	idempotentHint: true,   // safe to retry
	openWorldHint: false,   // tool doesn't access external systems
}
```

Use a shared constant for read-only tools to avoid repetition.

---

## Pre-indexed Pattern

### Startup pipeline

```
Load input → Validate → Preprocess/Minify → Build indexes → Pre-compute responses → Register tools → Connect transport
```

Everything is pre-computed. Tool calls are cheap lookups.

### Build all indexes in a single O(n) pass

```typescript
const indexes = buildIndexes(data);
// indexes contains: lookup maps, search blobs, pre-rendered text responses
```

### Dual-index for case-insensitive lookups

For every user-facing lookup, maintain two maps:

```typescript
tagIndex: Map<string, Operation[]>; // exact name → data
lowerTagIndex: Map<string, string>; // lowercased → exact name
```

Look up by exact match first, fall back to lowercase index.

### Pre-compute static responses

Responses for overview/listing tools should be computed once at startup and returned directly — zero per-call computation.

### Memoize expensive operations

Recursive resolution (e.g., `$ref` chains, tree summarization) should resolve each unique input at most once.

### Reload lifecycle

If the underlying data can change (log files, caches), expose an explicit reload tool:

- Re-read from disk and rebuild indexes.
- Return a delta summary (old count vs new count, new time range, etc.).
- Don't hide refresh behind normal tool calls unless freshness is required per call.

---

## Stateless Pattern

### Startup is minimal

Register tools, connect transport. No data loading.

### Enforce cost bounds on every call

Stateless tools do real work per invocation. Cap costs explicitly:

- **Cap input size** — reject oversized payloads with actionable errors (e.g., "HTML input exceeds 5 MB limit. Provide a URL instead.").
- **Cap output size** — paginate enumerable results with `limit`/`offset`; check `hasMore` in response.
- **Require explicit selectors** — when a bulk retrieval is expensive, require callers to specify what they want (e.g., `indices: [0, 3, 7]` instead of returning everything).
- **Clamp parameters** — `Math.min(Math.max(args.limit ?? 20, 1), 100)`.

### Classify errors, don't just stringify them

Map errors to categories with specific remediation:

```typescript
// File not found → suggest absolute path
// HTTP error → suggest checking URL reachability
// Network error → suggest checking connectivity
// Unknown → generic message
```

---

## Tool Design Checklist

### Naming

- Namespace all tools with a consistent prefix: `{domain}_list_*`, `{domain}_get_*`, `{domain}_search_*`.
- Use consistent verbs: `list`, `get`, `search`, `scan`, `explain`.
- Name parameters unambiguously: `user_id` not `user`, `workflow_id` not `id`.

### Tool selection

- [ ] Build tools for **workflows**, not raw operations.
- [ ] Consolidate multi-step operations into composite tools when agents always chain them.
- [ ] Cut tools that overlap — each tool must have a clear, distinct purpose.
- [ ] Fewer tools > more tools. Don't blindly wrap every endpoint/resource.

### Descriptions (treat as system prompts)

- Be specific about what the tool does and when to use it.
- Mention related tools: _"Use `xxx_list_tags` first to see available tag names."_
- If one tool supersedes another, say so explicitly.
- Number steps in a workflow: _"STEP 1 — Discovery"_, _"STEP 2 — Enumeration"_, _"STEP 3 — Retrieval"_.
- Small refinements to descriptions yield dramatic improvements in agent accuracy — iterate on them.

### Progressive disclosure pattern

Structure tools so agents can:

1. **Orient** — High-level overview (summary / discovery tool / `llms.txt`-style overview)
2. **Navigate** — Drill into areas (list, search, filter)
3. **Inspect** — Full detail on one item (get, explain, retrieve)

---

## Token Efficiency Rules

Every token competes for space in the agent's context window. Optimize aggressively.

### Minimize input data at startup (pre-indexed)

- Strip metadata, examples, and noise irrelevant to tool responses.
- Truncate long descriptions to the first sentence.
- Flatten trivial structural wrappers.

### Return only high-signal data

- Prefer names and descriptions over UUIDs and internal IDs.
- Filter out ubiquitous/repeated data — mention it once, not everywhere.
- Offer a `format` parameter (`compact` vs `detailed`) when it makes sense.
- Strip internal/pre-computed fields from output (use `_` prefix convention, then filter).

### Prefer search over listing

A search returning 5 results beats a list returning 200. When listing is necessary, paginate or truncate with hints:

```
Showing 10 of 47 results. Use a more specific query to narrow results.
```

---

## Search Implementation (Pre-indexed)

### Pre-lowercased search blobs

At index time, build a single concatenated string per searchable entity:

```typescript
_searchText = [name, path, summary, description, ...tags]
  .join(" ")
  .toLowerCase();
```

At query time: lowercase the query once, run `.includes()` against blobs.

### Rank results

1. Matches in name/path/id → higher score
2. Matches only in description → lower score

Sort by tier, then by original order.

---

## Error Handling

```typescript
// BAD
"Error: not found";

// GOOD — actionable, includes the failed input, suggests next step
"No schema named 'UserReponse' found.\nDid you mean 'UserResponse'?\nUse xxx_list_schemas to see all available schema names.";
```

Rules:

- Never throw from a tool handler — return errors with `isError: true`.
- Suggest which tool to call next.
- Check for near-misses (case mismatch, typos) and suggest corrections.
- Include the failed input so the agent knows what it tried.
- Classify errors by category (not found, network, validation, size limit) with specific remediation per category.

---

## Internal Fields Convention

- Prefix pre-computed/internal fields with `_`: `_searchText`, `_lowerPath`, `_summary`.
- Strip them with `stripInternalFields()` before returning to clients.

---

## Logging

Use `process.stderr.write()` for all server logging — **never `console.log`**. Stdout must stay clean for the stdio MCP transport.

---

## Transport

Support both transports by keeping selection in the entry point:

| Transport           | Use case                            | Notes                                      |
| ------------------- | ----------------------------------- | ------------------------------------------ |
| **stdio**           | Local dev, per-user hosts (VS Code) | Default. Simple. One server per client.    |
| **Streamable HTTP** | Shared server, CI, remote access    | Requires auth if exposed beyond localhost. |

Switch via env var or CLI flag. Never couple transport choice to logic.

For stateless servers, HTTP transport can use per-request server instances (no session state):

```typescript
Bun.serve({
  port,
  async fetch(req: Request): Promise<Response> {
    if (new URL(req.url).pathname === "/mcp") {
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless mode
      });
      const server = createMcpServer();
      await server.connect(transport);
      return await transport.handleRequest(req);
    }
    return new Response("Not Found", { status: 404 });
  },
});
```

---

## Testing

### Unit tests

Test every handler as a pure function against a self-contained mock fixture:

```typescript
const result = handleSearchEndpoints(indexes, "pets", 10, false);
expect(result.content[0].text).toContain("GET /pets");
```

Cover: happy paths, not-found, case-insensitivity, result limiting, edge cases, error classification.

### Eval framework

- Load multiple input sources of varying sizes.
- Auto-generate test cases by introspecting inputs — no hardcoded names.
- Run deterministic checks (no LLM needed).
- Report per-source and per-category results.
- Run in CI to catch regressions.

### Token benchmarking

Track token counts in tool responses. Compare against baselines after every change. Regressions in token efficiency directly degrade agent performance.

---

## Graceful Degradation

Optional features must never crash the server. If an optional input fails to load or validate, log a warning to stderr and continue without those tools.

---

## Server Naming

Derive the MCP server name from the data being served (e.g., `info.title` from a spec, the log file name), not a hardcoded string. This makes it clear to agents and users which service is connected. For servers with no startup data, use a descriptive static name.

---

## Cache Lifecycle (Hybrid Pattern)

When the server downloads or generates cached data at startup:

- Use **atomic refresh**: write to a temp directory, then rename into place. This prevents serving partial/corrupt data during refresh.
- Support a `--refresh` flag or similar to force cache rebuild.
- Handle concurrent startups safely — don't corrupt the cache if two instances start simultaneously.

---

## Quick-Start Skeletons

### Pre-indexed server

```typescript
// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  buildIndexes,
  handleListItems,
  handleGetItem,
  handleSearch,
} from "./lib.ts";

const input = await loadInput(process.argv[2]);
const indexes = buildIndexes(input);

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const server = new McpServer(
  { name: input.title ?? "my-mcp-server", version: "1.0.0" },
  {
    instructions:
      "Use my_list_items to discover available items, then my_get_item for details.",
  },
);

server.registerTool(
  "my_list_items",
  {
    description:
      "Lists all available items. Call this first to discover what's available.",
    annotations: READ_ONLY,
  },
  async () => handleListItems(indexes),
);

server.registerTool(
  "my_get_item",
  {
    description:
      "Get full detail for a specific item by name. Use my_list_items to see available names.",
    inputSchema: { name: z.string().describe("Item name from my_list_items") },
    annotations: READ_ONLY,
  },
  async ({ name }) => handleGetItem(indexes, name),
);

server.registerTool(
  "my_search",
  {
    description: "Search items by keyword. Returns ranked results.",
    inputSchema: { query: z.string().describe("Search keyword") },
    annotations: READ_ONLY,
  },
  async ({ query }) => handleSearch(indexes, query),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Stateless server

```typescript
// src/mcp/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { handleScan, handleGetDetail } from "./handlers.ts";

const server = new McpServer(
  { name: "my-analyzer", version: "1.0.0" },
  {
    instructions:
      "Use my_scan first to get an overview, then my_get_detail for specifics.",
  },
);

server.registerTool(
  "my_scan",
  {
    description:
      "STEP 1 — Scan a URL and return a bounded summary. Always call this first.",
    inputSchema: {
      url: z.string().describe("URL to scan"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ url }) => handleScan(url),
);

server.registerTool(
  "my_get_detail",
  {
    description:
      "STEP 2 — Get detail for specific items from a previous my_scan result. " +
      "Always provide explicit indices to avoid fetching everything.",
    inputSchema: {
      url: z.string().describe("Same URL used in my_scan"),
      indices: z
        .array(z.number())
        .describe("Item indices from my_scan results"),
      limit: z
        .number()
        .optional()
        .describe("Max items to return (default: 20, max: 100)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ url, indices, limit }) => handleGetDetail(url, indices, limit),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## Formatting

- Tabs for indentation.
- Double quotes for strings.
