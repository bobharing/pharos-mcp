import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { agenticAuditSchema } from "../schemas.ts";
import { getAgenticAudit } from "../lib/analysis.ts";
import { READ_ONLY_OPEN } from "./annotations.ts";
import { successResponse, errorResponse } from "../lib/responses.ts";

export function registerAgenticTools(server: McpServer) {
  server.registerTool(
    "pharos_agentic",
    {
      description:
        "Agentic browsing audit — checks how well a site supports AI agents and LLM-driven browsing. Evaluates: accessibility tree quality for agents, llms.txt presence and validity, WebMCP tool registration, WebMCP form coverage, WebMCP schema validity, and CLS stability. Use this to assess and improve a site's agent-readiness.",
      inputSchema: agenticAuditSchema,
      annotations: READ_ONLY_OPEN,
    },
    async ({ url, device, includeDetails }) => {
      try {
        const result = await getAgenticAudit(url, device);

        const audits = result.audits.map((audit) => {
          const a = audit as {
            id: string;
            title: string;
            description?: string;
            score: number | null;
            scoreDisplayMode?: string;
            displayValue?: string;
            details?: { items?: unknown[] };
          };

          const entry: Record<string, unknown> = {
            id: a.id,
            title: a.title,
            score: a.score !== null ? Math.round((a.score || 0) * 100) : null,
            displayValue: a.displayValue ?? "N/A",
            status: a.score === 1 ? "pass" : a.score === 0 ? "fail" : "informative",
          };

          if (includeDetails) {
            entry.description = a.description ?? "N/A";
            const items = a.details?.items ?? [];
            if (items.length > 0) entry.findings = items;
          }

          return entry;
        });

        return successResponse({
          url: result.url,
          device: result.device,
          overallScore: result.overallScore,
          auditCount: result.auditCount,
          passedAudits: result.passedAudits,
          failedAudits: result.failedAudits,
          audits,
          fetchTime: result.fetchTime,
        });
      } catch (error) {
        return errorResponse("Agentic browsing audit failed", { url, device }, error);
      }
    },
  );
}
