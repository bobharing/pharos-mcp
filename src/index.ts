#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAuditTools,
  registerPerformanceTools,
  registerAnalysisTools,
  registerSecurityTools,
  registerAgenticTools,
} from "./tools/index.ts";
import { registerPrompts } from "./prompts.ts";
import { registerResources } from "./resources.ts";
import { parseCliArgs } from "./cli.ts";
import { setChromeLaunchConfig } from "./lib/chrome.ts";
import { getActiveChromeInstances } from "./lib/lighthouse.ts";
import { getTransportMode, connectStdio, connectHttp } from "./transport.ts";
import packageJson from "../package.json" with { type: "json" };

const cliConfig = parseCliArgs(process.argv.slice(2));
setChromeLaunchConfig(cliConfig);

function createServer(): McpServer {
  const s = new McpServer(
    { name: "Pharos", version: packageJson.version },
    {
      instructions: `Pharos: Lighthouse-powered web auditing. Results cached 10 min per URL/device/throttling (cold audits: 5-15s).

CACHE STRATEGY: pharos_audit runs one Lighthouse audit and stores the full result. All subsequent tools for the same URL/device/throttling read from that stored result — no new Lighthouse run. Cache misses occur if device or throttling differs from the cached run. Always call pharos_audit first unless you only need one specific check.

WORKFLOW:
1. pharos_audit — warms cache + returns all category scores (start here)
2. pharos_performance — instant after step 1; performance score + budget check
3. pharos_core_web_vitals — instant after step 1; LCP/INP/CLS thresholds
4. pharos_compare_devices — runs both devices sequentially (10-30s cold; instant if cached)
5. pharos_security — instant after step 1; HTTPS, CSP checks
6. pharos_resources — instant after step 1; resource breakdown by type/size
7. pharos_unused_js — instant after step 1; find removable JavaScript
8. pharos_lcp — instant after step 1; LCP optimization opportunities
9. pharos_third_parties — instant after step 1; third-party entity breakdown by category with byte/blocking impact
10. pharos_agentic — instant after step 1; agent-readiness audit`,
    },
  );

  registerAuditTools(s);
  registerPerformanceTools(s);
  registerAnalysisTools(s);
  registerSecurityTools(s);
  registerAgenticTools(s);
  registerPrompts(s);
  registerResources(s);
  return s;
}

const mode = getTransportMode();
let serverInstance: McpServer | null = null;
if (mode === "http") {
  await connectHttp(createServer);
} else {
  serverInstance = createServer();
  await connectStdio(serverInstance);
  process.stderr.write(`Pharos MCP server v${packageJson.version} started\n`);
}

// Graceful shutdown
let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  process.stderr.write("Shutting down Pharos MCP server...\n");

  const chromeInstances = getActiveChromeInstances();
  const killPromises = [...chromeInstances].map((chrome) => Promise.resolve(chrome.kill()).catch(() => {}));
  await Promise.allSettled(killPromises);

  if (serverInstance) await serverInstance.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

