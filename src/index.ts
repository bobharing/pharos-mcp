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

const packageJson = await Bun.file(import.meta.dir + "/../package.json").json();

const cliConfig = parseCliArgs(process.argv.slice(2));
setChromeLaunchConfig(cliConfig);

const server = new McpServer(
  { name: "Pharos", version: packageJson.version },
  {
    instructions: `Pharos: Lighthouse-powered web auditing. Tool results cached 10 min per URL/device/throttling (cold audits: 5-15s).

CACHE STRATEGY: pharos_audit runs one Lighthouse audit and stores the full result. All subsequent tools for the same URL/device/throttling read from that stored result — no new Lighthouse run. Cache misses occur if device or throttling differs from the cached run. Always call pharos_audit first unless you only need one specific check.

WORKFLOW:
1. pharos_audit — runs Lighthouse + caches result; returns all category scores (start here)
2. pharos_performance — performance score + budget check
3. pharos_core_web_vitals — LCP/INP/CLS thresholds
4. pharos_compare_devices — reads from cache per device if pharos_audit already ran for that device; runs Lighthouse only for uncached devices (10-30s cold per uncached device)
5. pharos_security — HTTPS, CSP checks
6. pharos_resources — resource breakdown by type/size
7. pharos_unused_js — find removable JavaScript
8. pharos_lcp — LCP optimization opportunities
9. pharos_third_parties — third-party entity breakdown by category with byte/blocking impact
10. pharos_agentic — agent-readiness audit`,
  },
);

// Register all tool categories
registerAuditTools(server);
registerPerformanceTools(server);
registerAnalysisTools(server);
registerSecurityTools(server);
registerAgenticTools(server);

// Register prompts
registerPrompts(server);

// Register resources
registerResources(server);

const mode = getTransportMode();
if (mode === "http") {
  await connectHttp(server);
} else {
  await connectStdio(server);
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

  await server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

