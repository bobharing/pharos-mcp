import { runRawLighthouseAudit } from "./lighthouse.ts";
import { SECURITY_AUDITS, DEFAULTS } from "./constants.ts";

// Helper function to find unused JavaScript
export async function findUnusedJavaScript(
  url: string,
  device: "desktop" | "mobile" = "desktop",
  minBytes = DEFAULTS.MIN_UNUSED_JS_BYTES,
) {
  const runnerResult = await runRawLighthouseAudit(url, ["performance"], device);
  const { lhr } = runnerResult;

  const unusedJsAudit = lhr.audits["unused-javascript"];

  if (!unusedJsAudit || !unusedJsAudit.details) {
    return {
      url: lhr.finalDisplayedUrl,
      device,
      totalUnusedBytes: 0,
      items: [],
      fetchTime: lhr.fetchTime,
    };
  }

  // Filter items by minimum bytes
  const items = (unusedJsAudit.details.items || [])
    .filter((item: Record<string, unknown>) => (item.wastedBytes as number) >= minBytes)
    .map((item: Record<string, unknown>) => ({
      url: item.url as string,
      totalBytes: item.totalBytes as number,
      wastedBytes: item.wastedBytes as number,
      wastedPercent: Math.round(((item.wastedBytes as number) / (item.totalBytes as number)) * 100),
    }));

  const totalUnusedBytes = items.reduce((sum: number, item: { wastedBytes: number }) => sum + item.wastedBytes, 0);

  return {
    url: lhr.finalDisplayedUrl,
    device,
    totalUnusedBytes,
    items,
    fetchTime: lhr.fetchTime,
  };
}

// Maps Lighthouse's network-requests resourceType values to the schema enum values
const RESOURCE_TYPE_MAP: Record<string, string> = {
  image: "images",
  script: "javascript",
  stylesheet: "css",
  font: "fonts",
};

// Helper function to categorize resource type
function categorizeResourceType(item: Record<string, unknown>): string {
  if (item.resourceType) {
    const normalized = (item.resourceType as string).toLowerCase();
    return RESOURCE_TYPE_MAP[normalized] ?? "other";
  }

  if (item.mimeType) {
    const mimeType = item.mimeType as string;
    if (mimeType.startsWith("image/")) return "images";
    if (mimeType.includes("javascript")) return "javascript";
    if (mimeType.includes("css")) return "css";
    if (mimeType.includes("font")) return "fonts";
  }

  return "other";
}

// Helper function to analyze resources
export async function analyzeResources(
  url: string,
  device: "desktop" | "mobile" = "desktop",
  resourceTypes?: string[],
  minSize = DEFAULTS.MIN_RESOURCE_SIZE_KB,
) {
  const runnerResult = await runRawLighthouseAudit(url, ["performance"], device);
  const { lhr } = runnerResult;

  // Get resource summary from network-requests audit
  const networkAudit = lhr.audits["network-requests"];

  if (!networkAudit || !networkAudit.details) {
    return {
      url: lhr.finalDisplayedUrl,
      device,
      resources: [],
      summary: {},
      fetchTime: lhr.fetchTime,
    };
  }

  const resources = (networkAudit.details.items || [])
    .map((item: Record<string, unknown>) => {
      const sizeKB = ((item.transferSize as number) || 0) / 1024;
      const resourceType = categorizeResourceType(item);

      return {
        url: item.url as string,
        resourceType,
        transferSize: (item.transferSize as number) || 0,
        resourceSize: (item.resourceSize as number) || 0,
        sizeKB: Math.round(sizeKB * 100) / 100,
        mimeType: item.mimeType as string,
      };
    })
    .filter((resource: { sizeKB: number; resourceType: string }) => {
      if (minSize && resource.sizeKB < minSize) return false;
      if (resourceTypes && !resourceTypes.includes(resource.resourceType)) return false;
      return true;
    });

  // Create summary by resource type
  const summary = resources.reduce(
    (
      acc: Record<string, { count: number; totalSize: number }>,
      resource: { resourceType: string; transferSize: number },
    ) => {
      if (!acc[resource.resourceType]) {
        acc[resource.resourceType] = { count: 0, totalSize: 0 };
      }
      acc[resource.resourceType].count++;
      acc[resource.resourceType].totalSize += resource.transferSize;
      return acc;
    },
    {},
  );

  return {
    url: lhr.finalDisplayedUrl,
    device,
    resources,
    summary,
    fetchTime: lhr.fetchTime,
  };
}

// Helper function to get security audit
export async function getSecurityAudit(url: string, checks?: string[]) {
  const runnerResult = await runRawLighthouseAudit(url, ["best-practices"]);
  const { lhr } = runnerResult;

  // Maps user-facing check names to the Lighthouse audit IDs they correspond to.
  // Note: mixed-content and hsts are both evaluated by the is-on-https audit in Lighthouse 13.
  const CHECKS_TO_AUDIT_IDS: Record<string, string[]> = {
    https: ["is-on-https"],
    "mixed-content": ["is-on-https"],
    hsts: ["is-on-https"],
    csp: ["csp-xss"],
  };

  const allowedAuditIds = checks
    ? new Set(checks.flatMap((check) => CHECKS_TO_AUDIT_IDS[check] ?? []))
    : null;

  const auditResults = SECURITY_AUDITS.map((auditId) => {
    const audit = lhr.audits[auditId];
    if (audit && (!allowedAuditIds || allowedAuditIds.has(auditId))) {
      return {
        id: auditId,
        title: audit.title,
        description: audit.description,
        score: audit.score,
        scoreDisplayMode: audit.scoreDisplayMode,
        displayValue: audit.displayValue,
        details: audit.details,
      };
    }
    return null;
  }).filter(Boolean);

  const passedCount = auditResults.filter((audit) => audit?.score === 1).length;
  const overallScore = auditResults.length > 0 ? passedCount / auditResults.length : 0;

  return {
    url: lhr.finalDisplayedUrl,
    overallScore: Math.round(overallScore * 100),
    audits: auditResults,
    fetchTime: lhr.fetchTime,
  };
}

// Audit IDs belonging to the agentic-browsing Lighthouse category
const AGENTIC_AUDIT_IDS = [
  "agent-accessibility-tree",
  "llms-txt",
  "webmcp-form-coverage",
  "webmcp-registered-tools",
  "webmcp-schema-validity",
  "cumulative-layout-shift",
] as const;

// Helper function to run the agentic-browsing audit
export async function getAgenticAudit(url: string, device: "desktop" | "mobile" = "desktop") {
  const runnerResult = await runRawLighthouseAudit(url, ["agentic-browsing"], device);
  const { lhr } = runnerResult;

  const auditResults = AGENTIC_AUDIT_IDS.map((auditId) => {
    const audit = lhr.audits[auditId];
    if (!audit) return null;
    return {
      id: auditId,
      title: audit.title,
      description: audit.description,
      score: audit.score,
      scoreDisplayMode: audit.scoreDisplayMode,
      displayValue: audit.displayValue,
      details: audit.details,
    };
  }).filter(Boolean);

  const scoredAudits = auditResults.filter((a) => a?.score !== null && a?.scoreDisplayMode !== "informative");
  const passedCount = scoredAudits.filter((a) => a?.score === 1).length;
  const overallScore = scoredAudits.length > 0 ? passedCount / scoredAudits.length : 0;

  return {
    url: lhr.finalDisplayedUrl,
    device,
    overallScore: Math.round(overallScore * 100),
    audits: auditResults,
    auditCount: auditResults.length,
    passedAudits: scoredAudits.filter((a) => a?.score === 1).length,
    failedAudits: scoredAudits.filter((a) => a?.score === 0).length,
    fetchTime: lhr.fetchTime,
  };
}
