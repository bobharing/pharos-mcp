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
        "Run first: runs one Lighthouse audit and stores the full result so all other pharos_* tools read from cache (no new Lighthouse run) — pass the same device + throttling values. Returns all category scores and key metrics. Use focusCategory or includeDetails for per-audit breakdowns. Add includeDescriptions for audit explanation text (verbose).",
      inputSchema: auditParamsSchema,
      annotations: READ_ONLY_OPEN,
    },
    async ({ url, categories, device, throttling, forceFresh, includeDetails, includeDescriptions, focusCategory }) => {
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

        // Phase 3: detected frameworks from stack packs
        if (lhr.stackPacks?.length) {
          data.detectedFrameworks = lhr.stackPacks.map((sp) => sp.title);
        }

        // Phase 4: benchmark index for score contextualization
        if (lhr.environment?.benchmarkIndex !== undefined) {
          data.benchmarkIndex = lhr.environment.benchmarkIndex;
        }

        if (includeDetails || focusCategory) {
          const targetCategories = focusCategory ? [focusCategory] : Object.keys(lhr.categories);
          const detailedAudits: Record<string, unknown> = {};
          for (const cat of targetCategories) {
            detailedAudits[cat] = filterAuditsByCategory(lhr, cat, includeDescriptions, lhr.stackPacks);
          }
          data.detailedAudits = detailedAudits;
        }

        return successResponse(data, lhr.runWarnings?.length ? lhr.runWarnings : undefined, lhr.runtimeError);
      } catch (error) {
        return errorResponse("Lighthouse audit failed", { url, device: device || "desktop" }, error);
      }
    },
  );
}
