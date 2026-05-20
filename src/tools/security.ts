import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { securityAuditSchema } from "../schemas.ts";
import { getSecurityAudit } from "../lib/analysis.ts";
import { READ_ONLY_OPEN } from "./annotations.ts";
import { successResponse, errorResponse } from "../lib/responses.ts";

export function registerSecurityTools(server: McpServer) {
  server.registerTool(
    "pharos_security",
    {
      description:
        "Security audit: HTTPS, mixed-content, HSTS, and CSP. Instant if pharos_audit already ran. Note: https/mixed-content/hsts all map to the same is-on-https audit.",
      inputSchema: securityAuditSchema,
      annotations: READ_ONLY_OPEN,
    },
    async ({ url, device, throttling, forceFresh, checks }) => {
      try {
        const result = await getSecurityAudit(url, checks, device, throttling, { forceFresh });

        const audits = result.audits.map((audit) => {
          const auditItem = audit as {
            id: string;
            title: string;
            description?: string;
            score: number | null;
            scoreDisplayMode?: string;
            displayValue?: string;
            details?: { items?: unknown[] };
          };

          const findings = auditItem.details?.items ?? [];
          return {
            id: auditItem.id,
            title: auditItem.title,
            description: auditItem.description || "N/A",
            score: auditItem.score !== null ? Math.round((auditItem.score || 0) * 100) : null,
            displayValue: auditItem.displayValue || "N/A",
            status: auditItem.score === 1 ? "pass" : auditItem.score === 0 ? "fail" : "warning",
            ...(findings.length > 0 ? { findings } : {}),
          };
        });

        return successResponse(
          {
            url: result.url,
            device: device ?? "desktop",
            overallScore: result.overallScore,
            audits,
            auditCount: audits.length,
            passedAudits: audits.filter((a) => a.status === "pass").length,
            warningAudits: audits.filter((a) => a.status === "warning").length,
            failedAudits: audits.filter((a) => a.status === "fail").length,
            fetchTime: result.fetchTime,
          },
          result.warnings?.length ? result.warnings : undefined,
          result.runtimeError,
        );
      } catch (error) {
        return errorResponse("Security audit failed", { url }, error);
      }
    },
  );
}
