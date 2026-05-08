import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resourceAnalysisSchema, unusedJavaScriptSchema } from "../schemas.ts";
import { findUnusedJavaScript, analyzeResources } from "../lib/analysis.ts";
import { READ_ONLY_OPEN } from "./annotations.ts";
import { successResponse, errorResponse } from "../lib/responses.ts";

export function registerAnalysisTools(server: McpServer) {
  server.registerTool(
    "pharos_unused_js",
    {
      description: "Find unused JavaScript code that can be removed to reduce bundle size.",
      inputSchema: unusedJavaScriptSchema,
      annotations: READ_ONLY_OPEN,
    },
    async ({ url, device, forceFresh, minBytes }) => {
      try {
        const result = await findUnusedJavaScript(url, device, minBytes, { forceFresh });

        return successResponse({
          url: result.url,
          device: result.device,
          timestamp: result.fetchTime,
          thresholdBytes: minBytes,
          summary: {
            totalUnusedKB: Math.round((result.totalUnusedBytes / 1024) * 100) / 100,
            totalFilesAnalyzed: result.items.length,
            hasUnusedCode: result.items.length > 0,
          },
          unusedFiles: result.items.map((item) => ({
            filename: item.url.split("/").pop() || item.url,
            totalKB: Math.round((item.totalBytes / 1024) * 100) / 100,
            unusedKB: Math.round((item.wastedBytes / 1024) * 100) / 100,
            unusedPercent: item.wastedPercent,
            url: item.url,
          })),
        });
      } catch (error) {
        return errorResponse("Unused JavaScript analysis failed", { url, device }, error);
      }
    },
  );

  server.registerTool(
    "pharos_resources",
    {
      description:
        "Analyze page resources (images, JS, CSS, fonts) by type and size. Use to find optimization opportunities.",
      inputSchema: resourceAnalysisSchema,
      annotations: READ_ONLY_OPEN,
    },
    async ({ url, device, forceFresh, resourceTypes, minSize }) => {
      try {
        const result = await analyzeResources(url, device, resourceTypes, minSize, { forceFresh });

        const resourceCounts: Record<string, { count: number; sizeKB: number }> = {};
        for (const [type, data] of Object.entries(result.summary)) {
          resourceCounts[type] = {
            count: data.count,
            sizeKB: Math.round((data.totalSize / 1024) * 100) / 100,
          };
        }

        const totalSizeKB =
          Math.round(
            (Object.values(result.summary).reduce((sum, data) => sum + data.totalSize, 0) / 1024) * 100,
          ) / 100;

        const resources = result.resources.slice(0, 50).map((resource) => ({
          filename: resource.url.split("/").pop() || resource.url,
          type: resource.resourceType,
          sizeKB: Math.round(resource.sizeKB * 100) / 100,
          mimeType: resource.mimeType || "unknown",
          url: resource.url,
        }));

        if (result.resources.length > 50) {
          resources.push({
            filename: `... and ${result.resources.length - 50} more resources`,
            type: "truncated",
            sizeKB: 0,
            mimeType: "info",
            url: "",
          });
        }

        return successResponse({
          url: result.url,
          device: result.device,
          timestamp: result.fetchTime,
          filters: { resourceTypes: resourceTypes || ["all"], minSizeKB: minSize || 0 },
          summary: { totalResources: result.resources.length, totalSizeKB, resourceCounts },
          resources,
        });
      } catch (error) {
        return errorResponse("Resource analysis failed", { url, device, resourceTypes, minSize }, error);
      }
    },
  );
}