import { runRawLighthouseAudit } from "./lighthouse.ts";
import { SECURITY_AUDITS, DEFAULTS } from "./constants.ts";

// Helper function to find unused JavaScript
export async function findUnusedJavaScript(
  url: string,
  device: "desktop" | "mobile" = "desktop",
  minBytes = DEFAULTS.MIN_UNUSED_JS_BYTES,
  throttling = false,
  options?: { forceFresh?: boolean },
) {
  const runnerResult = await runRawLighthouseAudit(url, ["performance"], device, throttling, options);
  const { lhr } = runnerResult;

  const unusedJsAudit = lhr.audits["unused-javascript"];

  if (!unusedJsAudit || !unusedJsAudit.details) {
    return {
      url: lhr.finalDisplayedUrl,
      device,
      totalUnusedBytes: 0,
      items: [],
      fetchTime: lhr.fetchTime,
      warnings: lhr.runWarnings?.length ? lhr.runWarnings : undefined,
      runtimeError: lhr.runtimeError,
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
    warnings: lhr.runWarnings?.length ? lhr.runWarnings : undefined,
    runtimeError: lhr.runtimeError,
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
  throttling = false,
  options?: { forceFresh?: boolean },
) {
  const runnerResult = await runRawLighthouseAudit(url, ["performance"], device, throttling, options);
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
      warnings: lhr.runWarnings?.length ? lhr.runWarnings : undefined,
      runtimeError: lhr.runtimeError,
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
    warnings: lhr.runWarnings?.length ? lhr.runWarnings : undefined,
    runtimeError: lhr.runtimeError,
  };
}

// Helper function to get security audit
export async function getSecurityAudit(
  url: string,
  checks?: string[],
  device: "desktop" | "mobile" = "desktop",
  throttling = false,
  options?: { forceFresh?: boolean },
) {
  const runnerResult = await runRawLighthouseAudit(url, ["best-practices"], device, throttling, options);
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
    warnings: lhr.runWarnings?.length ? lhr.runWarnings : undefined,
    runtimeError: lhr.runtimeError,
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
export async function getAgenticAudit(url: string, device: "desktop" | "mobile" = "desktop", throttling = false, options?: { forceFresh?: boolean }) {
  const runnerResult = await runRawLighthouseAudit(url, ["agentic-browsing"], device, throttling, options);
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
    warnings: lhr.runWarnings?.length ? lhr.runWarnings : undefined,
    runtimeError: lhr.runtimeError,
  };
}

// Helper function to get third-party entity breakdown
export async function getThirdPartyAnalysis(
  url: string,
  device: "desktop" | "mobile" = "desktop",
  throttling = false,
  options?: { forceFresh?: boolean },
  includeDetails = false,
) {
  const runnerResult = await runRawLighthouseAudit(url, undefined, device, throttling, options);
  const { lhr } = runnerResult;

  const entities = lhr.entities ?? [];

  // Build per-entity impact map from third-party-summary audit
  const entityImpact: Record<string, { transferBytes: number; blockingTimeMs: number; auditIds: string[] }> = {};

  const thirdPartySummaryAudit = lhr.audits["third-party-summary"];
  if (thirdPartySummaryAudit?.details?.items) {
    for (const item of thirdPartySummaryAudit.details.items as Record<string, unknown>[]) {
      const entityName = (item.entity as string) || "";
      if (entityName) {
        entityImpact[entityName] = {
          transferBytes: (item.transferSize as number) || 0,
          blockingTimeMs: Math.round((item.blockingTime as number) || 0),
          auditIds: ["third-party-summary"],
        };
      }
    }
  }

  const thirdPartyFacadesAudit = lhr.audits["third-party-facades"];
  if (thirdPartyFacadesAudit?.details?.items) {
    for (const item of thirdPartyFacadesAudit.details.items as Record<string, unknown>[]) {
      const entityName = (item.entity as string) || "";
      if (entityName) {
        if (!entityImpact[entityName]) {
          entityImpact[entityName] = { transferBytes: 0, blockingTimeMs: 0, auditIds: [] };
        }
        if (!entityImpact[entityName].auditIds.includes("third-party-facades")) {
          entityImpact[entityName].auditIds.push("third-party-facades");
        }
      }
    }
  }

  const firstPartyEntities = entities.filter((e) => e.isFirstParty);
  const thirdPartyEntities = entities.filter((e) => !e.isFirstParty);

  // Group third-party entities by category
  const groupedByCategory: Record<
    string,
    Array<{
      name: string;
      origins?: string[];
      transferKB: number;
      blockingTimeMs: number;
      auditsPresent: string[];
    }>
  > = {};

  for (const entity of thirdPartyEntities) {
    const category = entity.category || "other";
    if (!groupedByCategory[category]) {
      groupedByCategory[category] = [];
    }
    const impact = entityImpact[entity.name] ?? { transferBytes: 0, blockingTimeMs: 0, auditIds: [] };
    groupedByCategory[category].push({
      name: entity.name,
      ...(includeDetails ? { origins: entity.origins } : {}),
      transferKB: Math.round((impact.transferBytes / 1024) * 100) / 100,
      blockingTimeMs: impact.blockingTimeMs,
      auditsPresent: impact.auditIds,
    });
  }

  const totalTransferBytes = Object.values(entityImpact).reduce((sum, e) => sum + e.transferBytes, 0);
  const totalBlockingMs = Object.values(entityImpact).reduce((sum, e) => sum + e.blockingTimeMs, 0);

  return {
    url: lhr.finalDisplayedUrl,
    device,
    fetchTime: lhr.fetchTime,
    summary: {
      firstPartyCount: firstPartyEntities.length,
      thirdPartyCount: thirdPartyEntities.length,
      totalThirdPartyKB: Math.round((totalTransferBytes / 1024) * 100) / 100,
      totalThirdPartyBlockingMs: Math.round(totalBlockingMs),
    },
    categories: groupedByCategory,
    warnings: lhr.runWarnings?.length ? lhr.runWarnings : undefined,
    runtimeError: lhr.runtimeError,
  };
}
