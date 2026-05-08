import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  runRawLighthouseAudit,
  formatCategoryScores,
  filterAuditsByCategory,
  extractKeyMetrics,
} from "../lib/lighthouse.ts";
import { auditParamsSchema } from "../schemas.ts";
import { READ_ONLY_OPEN } from "./annotations.ts";
import { successResponse, errorResponse } from "../lib/responses.ts";

export function registerAuditTools(server: McpServer) {
  server.registerTool(
    "pharos_audit",
    {
      description:
        "STEP 1 — Run a comprehensive Lighthouse audit. Returns category scores and key metrics. Start here for a full overview, then drill into specific areas with other pharos_* tools. Use focusCategory or includeDetails to get per-audit breakdowns in the same call.",
      inputSchema: auditParamsSchema,
      annotations: READ_ONLY_OPEN,
    },
    async ({ url, categories, device, throttling, forceFresh, includeDetails, focusCategory }) => {
      try {
        // Ensure focusCategory is included in the Lighthouse run even if not in categories
        const effectiveCategories = focusCategory
          ? categories
            ? categories.includes(focusCategory)
              ? categories
              : [...categories, focusCategory]
            : [focusCategory]
          : categories;
        const runnerResult = await runRawLighthouseAudit(url, effectiveCategories, device, throttling, { forceFresh });
        const { lhr } = runnerResult;

        const formattedCategories = formatCategoryScores(lhr);
        const metrics = extractKeyMetrics(lhr);

        const categoryScores: Record<string, { title: string; score: number }> = {};
        for (const [key, category] of Object.entries(formattedCategories)) {
          categoryScores[key] = { title: category.title, score: category.score };
        }

        const metricValues: Record<string, { title: string; value: string; score: number | null }> = {};
        for (const [key, metric] of Object.entries(metrics)) {
          metricValues[key] = { title: metric.title, value: metric.displayValue, score: metric.score };
        }

        const data: Record<string, unknown> = {
          categories: categoryScores,
          metrics: metricValues,
          version: lhr.lighthouseVersion,
          fetchTime: lhr.fetchTime,
        };

        if (includeDetails || focusCategory) {
          const targetCategories = focusCategory ? [focusCategory] : Object.keys(lhr.categories);
          const detailedAudits: Record<string, unknown> = {};
          for (const cat of targetCategories) {
            detailedAudits[cat] = filterAuditsByCategory(lhr, cat);
          }
          data.detailedAudits = detailedAudits;
        }

        return successResponse(data);
      } catch (error) {
        return errorResponse("Lighthouse audit failed", { url, device: device || "desktop" }, error);
      }
    },
  );
}
