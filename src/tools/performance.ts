import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { performanceSchema, coreWebVitalsSchema, compareDevicesSchema, lcpOpportunitiesSchema } from "../schemas.ts";
import { getCoreWebVitals, compareMobileDesktop, getLcpOpportunities } from "../lib/performance.ts";
import { runRawLighthouseAudit, formatCategoryScores, extractKeyMetrics } from "../lib/lighthouse.ts";
import { BUDGET_METRIC_MAPPINGS } from "../lib/constants.ts";
import { READ_ONLY_OPEN } from "./annotations.ts";
import { successResponse, errorResponse } from "../lib/responses.ts";

export function registerPerformanceTools(server: McpServer) {
  server.registerTool(
    "pharos_performance",
    {
      description:
        "Get detailed performance score and metrics. Optionally check against a budget. Use after pharos_audit if you need deeper performance data or budget validation.",
      inputSchema: performanceSchema,
      annotations: READ_ONLY_OPEN,
    },
    async ({ url, device, forceFresh, budget }) => {
      try {
        const runnerResult = await runRawLighthouseAudit(url, ["performance"], device, false, { forceFresh });
        const { lhr } = runnerResult;

        const formattedCategories = formatCategoryScores(lhr);
        const metrics = extractKeyMetrics(lhr);

        const metricValues: Record<string, { title: string; value: string; score: number | null }> = {};
        for (const [key, metric] of Object.entries(metrics)) {
          metricValues[key] = { title: metric.title, value: metric.displayValue, score: metric.score };
        }

        const data: Record<string, unknown> = {
          performanceScore: formattedCategories.performance?.score || 0,
          metrics: metricValues,
          fetchTime: lhr.fetchTime,
        };

        if (budget) {
          const budgetResults: Record<string, { actual: number; budget: number; passed: boolean; unit: string }> = {};
          let overallPassed = true;

          if (budget.performanceScore !== undefined) {
            const actual = formattedCategories.performance?.score || 0;
            const passed = actual >= budget.performanceScore;
            budgetResults.performanceScore = { actual, budget: budget.performanceScore, passed, unit: "score" };
            if (!passed) overallPassed = false;
          }

          for (const { key, metric, unit } of BUDGET_METRIC_MAPPINGS) {
            const budgetValue = (budget as Record<string, number | undefined>)[key];
            if (budgetValue !== undefined) {
              const actual = metrics[metric]?.value || 0;
              const passed = actual <= budgetValue;
              budgetResults[key] = { actual, budget: budgetValue, passed, unit };
              if (!passed) overallPassed = false;
            }
          }

          data.budgetResults = budgetResults;
          data.overallPassed = overallPassed;
        }

        return successResponse(data);
      } catch (error) {
        return errorResponse("Performance analysis failed", { url, device: device || "desktop" }, error);
      }
    },
  );

  server.registerTool(
    "pharos_core_web_vitals",
    {
      description:
        "Get Core Web Vitals (LCP, FCP, CLS, TBT) with optional threshold checking. Use when you need to validate against specific performance targets. Threshold parameters: lcp (seconds), inp (milliseconds, evaluated via TBT as a lab proxy — INP replaced FID as a Core Web Vital), cls (unitless score).",
      inputSchema: coreWebVitalsSchema,
      annotations: READ_ONLY_OPEN,
    },
    async ({ url, device, forceFresh, includeDetails, threshold }) => {
      try {
        const result = await getCoreWebVitals(url, device, threshold, { forceFresh });

        const coreWebVitals: Record<string, { title: string; value: string; score: number | null | undefined }> = {};
        for (const [key, metric] of Object.entries(result.coreWebVitals)) {
          coreWebVitals[key] = {
            title: metric?.title || key.toUpperCase(),
            value: metric?.displayValue || "N/A",
            score: metric?.score,
          };
        }

        return successResponse({
          url: result.url,
          device: result.device,
          coreWebVitals,
          ...(includeDetails ? { allMetrics: result.allMetrics } : {}),
          thresholdResults: result.thresholdResults || {},
          fetchTime: result.fetchTime,
        });
      } catch (error) {
        return errorResponse("Core Web Vitals analysis failed", { url, device: device || "desktop" }, error);
      }
    },
  );

  server.registerTool(
    "pharos_compare_devices",
    {
      description:
        "Compare performance between mobile and desktop. Runs two sequential audits — takes 10-30 seconds.",
      inputSchema: compareDevicesSchema,
      annotations: READ_ONLY_OPEN,
    },
    async ({ url, categories, throttling, forceFresh, includeDetails }) => {
      try {
        const result = await compareMobileDesktop(url, categories, throttling, { forceFresh });

        const differences: Record<string, { mobile: number; desktop: number; difference: number; better: string }> =
          {};
        for (const [category, diff] of Object.entries(result.differences)) {
          differences[category] = {
            mobile: diff.mobile,
            desktop: diff.desktop,
            difference: diff.difference,
            better: diff.difference > 0 ? "desktop" : "mobile",
          };
        }

        return successResponse({
          url: result.url,
          differences,
          ...(includeDetails ? { mobile: result.mobile, desktop: result.desktop } : {}),
        });
      } catch (error) {
        return errorResponse("Mobile vs Desktop comparison failed", { url }, error);
      }
    },
  );

  server.registerTool(
    "pharos_lcp",
    {
      description: "Get LCP optimization opportunities. Use when LCP exceeds thresholds.",
      inputSchema: lcpOpportunitiesSchema,
      annotations: READ_ONLY_OPEN,
    },
    async ({ url, device, forceFresh, threshold, includeDetails }) => {
      try {
        const result = await getLcpOpportunities(url, device, threshold, { forceFresh });

        const opportunities = (result.opportunities || []).map((opp) => {
          const o = opp as {
            id: string;
            title: string;
            score: number;
            displayValue?: string;
            description?: string;
            numericValue?: number;
          };
          const base = { id: o.id, title: o.title, score: o.score, displayValue: o.displayValue };
          return includeDetails ? { ...base, description: o.description, numericValue: o.numericValue } : base;
        });

        return successResponse({
          url: result.url,
          device: result.device,
          lcpValue: result.lcpValue,
          threshold: result.threshold,
          needsImprovement: result.needsImprovement,
          opportunities,
          fetchTime: result.fetchTime,
        });
      } catch (error) {
        return errorResponse("LCP opportunities analysis failed", { url, device: device || "desktop" }, error);
      }
    },
  );
}