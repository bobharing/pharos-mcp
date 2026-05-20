# Phase 6: Testing Migration & HTTP Transport

## Objective

Replace Vitest with Bun's built-in test runner, migrate existing tests, add a Streamable HTTP transport option via `Bun.serve()`, and clean up remaining dev dependencies.

## Prerequisites

- Phase 5 complete (code restructured, utilities in place)

## Part A: Test Migration (Vitest → bun:test)

### Step 1: Understand the migration

Bun's test API is intentionally compatible with Vitest/Jest:
- `describe`, `it`/`test`, `expect` — same API
- `beforeEach`, `afterEach`, `beforeAll`, `afterAll` — same
- `vi.fn()` → `mock()` (from `bun:test`)
- `vi.spyOn()` → `spyOn()` (from `bun:test`)
- `vi.mock()` → `mock.module()` (from `bun:test`)

### Step 2: Update test file imports

In every `*.test.ts` file, replace:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
```
With:
```typescript
import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
```

### Step 3: Replace `vi.fn()` with `mock()`

```typescript
// Before
const mockFn = vi.fn().mockResolvedValue(result);

// After
const mockFn = mock().mockResolvedValue(result);
```

### Step 4: Replace `vi.mock()` with `mock.module()`

```typescript
// Before
vi.mock("../lighthouse-core.js", () => ({
  runRawLighthouseAudit: vi.fn(),
}));

// After
mock.module("../lib/lighthouse.ts", () => ({
  runRawLighthouseAudit: mock(),
}));
```

Note: Update module paths to use new `.ts` extensions and `lib/` structure from Phase 5.

### Step 5: Update test file extensions (if needed)

Bun discovers tests by `*.test.ts` pattern by default — same as Vitest. No filename changes needed.

### Step 6: Remove Vitest config

Delete `vitest.config.ts` — Bun uses `bunfig.toml` for test configuration if needed:

```toml
# bunfig.toml (optional — defaults are usually fine)
[test]
coverage = true
coverageReporter = ["text", "lcov"]
```

### Step 7: Remove Vitest dependencies

In `package.json`, remove:
- `vitest`
- `@vitest/coverage-v8`
- `@vitest/ui`

### Step 8: Verify all tests pass

```bash
bun test
```

Fix any remaining compatibility issues. Common gotchas:
- `vi.clearAllMocks()` → `mock.restore()` or clear mocks manually
- Timer mocks have slightly different APIs
- Module mocking scope differs slightly

## Part B: HTTP Transport

### Step 1: Create `src/transport.ts`

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export type TransportMode = "stdio" | "http";

export function getTransportMode(): TransportMode {
  const mode = process.env.PHAROS_TRANSPORT ?? "stdio";
  if (mode === "http" || mode === "stdio") return mode;
  process.stderr.write(`Unknown transport "${mode}", defaulting to stdio\n`);
  return "stdio";
}

export function getHttpPort(): number {
  const port = Number(process.env.PHAROS_PORT ?? "3000");
  return Number.isFinite(port) && port > 0 ? port : 3000;
}

export async function connectStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function connectHttp(server: McpServer): Promise<void> {
  const port = getHttpPort();

  Bun.serve({
    port,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);

      if (url.pathname === "/mcp") {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless
        });
        await server.connect(transport);
        return await transport.handleRequest(req);
      }

      if (url.pathname === "/health") {
        return new Response("ok");
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  process.stderr.write(`Pharos HTTP transport listening on port ${port}\n`);
}
```

### Step 2: Update `src/index.ts` to use transport selection

```typescript
import { getTransportMode, connectStdio, connectHttp } from "./transport.ts";

// ... server setup ...

const mode = getTransportMode();
if (mode === "http") {
  await connectHttp(server);
} else {
  await connectStdio(server);
}
```

### Step 3: Document transport configuration

Add to README:
```markdown
## Transport

By default, Pharos uses stdio transport (for VS Code, Claude Desktop, etc.).

For HTTP transport (shared/remote access):
```bash
PHAROS_TRANSPORT=http PHAROS_PORT=3000 bun run src/index.ts
```
```

## Part C: Cleanup

### Step 1: Remove unused dev dependencies

Remove from `devDependencies`:
- `tsx` (Bun runs TS directly)
- `husky` + `is-ci` (optional — keep if you want git hooks)
- `lint-staged` (optional — keep if you want pre-commit linting)

### Step 2: Remove unused config files

- Delete `vitest.config.ts`
- Optionally remove `.husky/` directory if removing husky

### Step 3: Update `README.md`

Update the README to reflect:
- Bun as the runtime
- New tool names (`pharos_*`)
- HTTP transport option
- Updated install/run instructions

### Step 4: Final dependency audit

```bash
bun install
bun test
bun run src/index.ts --help  # or just start and verify
```

## Acceptance Criteria

- [ ] `bun test` runs all tests and they pass
- [ ] No Vitest imports remain in any test file
- [ ] `vitest.config.ts` is deleted
- [ ] `PHAROS_TRANSPORT=http bun run src/index.ts` starts an HTTP server on the configured port
- [ ] `curl http://localhost:3000/health` returns "ok"
- [ ] stdio transport still works as default
- [ ] No unused dev dependencies remain
- [ ] README reflects the new setup

## Notes

- The HTTP transport uses Bun's native `Bun.serve()` which is significantly faster than Express/Hono for this use case.
- Stateless HTTP mode (no session ID) is correct for this server since each audit is independent.
- If the MCP SDK's `StreamableHTTPServerTransport` has a different import path or API, check the SDK docs for the exact usage. The pattern above follows the `mcp-server-instructions.md` example using `WebStandardStreamableHTTPServerTransport`.
