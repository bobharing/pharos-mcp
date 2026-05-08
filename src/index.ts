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
    instructions: `Pharos is a Lighthouse-powered web auditing server. Each tool launches Chrome to audit a URL (5-15 seconds per call).

WORKFLOW:
1. pharos_audit — Full overview of all categories (use focusCategory for details on one area)
2. pharos_performance — Detailed performance with optional budget checking
3. pharos_core_web_vitals — Core Web Vitals with threshold validation
4. pharos_compare_devices — Mobile vs desktop (runs two audits, 10-30s)
5. pharos_security — HTTPS, CSP, HTTP/2, vulnerability checks
6. pharos_resources — Resource breakdown by type and size
7. pharos_unused_js — Find removable JavaScript
8. pharos_lcp — LCP optimization opportunities`,
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

