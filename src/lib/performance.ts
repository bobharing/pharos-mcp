import { runLighthouseAudit, runRawLighthouseAudit } from "./lighthouse.ts";
import { LCP_OPPORTUNITIES, DEFAULTS } from "./constants.ts";

// Helper function to get Core Web Vitals
export async function getCoreWebVitals(
  url: string,
  device: "desktop" | "mobile" = "desktop",
  threshold?: { lcp?: number; inp?: number; cls?: number },
  throttling = false,
  options?: { forceFresh?: boolean },
) {
  const result = await runLighthouseAudit(url, ["performance"], device, throttling, options);

  const coreWebVitals = {
    lcp: result.metrics["largest-contentful-paint"],
    fcp: result.metrics["first-contentful-paint"],
    cls: result.metrics["cumulative-layout-shift"],
    tbt: result.metrics["total-blocking-time"], // TBT is used as INP proxy in lab tests (INP replaced FID as a Core Web Vital)
  };

  const thresholdResults = threshold
    ? {
        lcp: threshold.lcp != null ? (coreWebVitals.lcp?.value || 0) / 1000 <= threshold.lcp : null,
        inp: threshold.inp != null ? (coreWebVitals.tbt?.value || 0) <= threshold.inp : null,
        cls: threshold.cls != null ? (coreWebVitals.cls?.value || 0) <= threshold.cls : null,
      }
    : null;

  return {
    url: result.url,
    device: result.device,
    coreWebVitals,
    allMetrics: result.metrics,
    thresholdResults,
    fetchTime: result.fetchTime,
    warnings: result.warnings,
    runtimeError: result.runtimeError,
  };
}

// Helper function to compare mobile vs desktop
export async function compareMobileDesktop(
  url: string,
  categories?: string[],
  throttling = false,
  options?: { forceFresh?: boolean },
) {
  // Run sequentially to avoid skewing results from concurrent system resource contention.
  const mobileResult = await runLighthouseAudit(url, categories, "mobile", throttling, options);
  const desktopResult = await runLighthouseAudit(url, categories, "desktop", throttling, options);

  const comparison = {
    url: mobileResult.url,
    mobile: {
      categories: mobileResult.categories,
      metrics: mobileResult.metrics,
    },
    desktop: {
      categories: desktopResult.categories,
      metrics: desktopResult.metrics,
    },
    differences: {} as Record<string, { mobile: number; desktop: number; difference: number }>,
    warnings: [
      ...(mobileResult.warnings ?? []),
      ...(desktopResult.warnings ?? []),
    ].filter((v, i, a) => a.indexOf(v) === i),
    runtimeError: mobileResult.runtimeError ?? desktopResult.runtimeError,
  };

  // Calculate differences for categories
  for (const [key, mobileCategory] of Object.entries(mobileResult.categories)) {
    const desktopCategory = desktopResult.categories[key];
    if (desktopCategory) {
      comparison.differences[key] = {
        mobile: mobileCategory.score,
        desktop: desktopCategory.score,
        difference: desktopCategory.score - mobileCategory.score,
      };
    }
  }

  return comparison;
}

// Helper function to get LCP optimization opportunities
export async function getLcpOpportunities(
  url: string,
  device: "desktop" | "mobile" = "desktop",
  threshold = DEFAULTS.LCP_THRESHOLD,
  throttling = false,
  options?: { forceFresh?: boolean },
) {
  const runnerResult = await runRawLighthouseAudit(url, ["performance"], device, throttling, options);
  const { lhr } = runnerResult;

  const lcpValue = (lhr.audits["largest-contentful-paint"]?.numericValue || 0) / 1000;
  const needsImprovement = lcpValue > threshold;

  const opportunities = LCP_OPPORTUNITIES.map((auditId) => {
    const audit = lhr.audits[auditId];
    if (audit && audit.score !== null && audit.score < 1) {
      return {
        id: auditId,
        title: audit.title,
        description: audit.description,
        score: audit.score,
        displayValue: audit.displayValue,
        numericValue: audit.numericValue,
      };
    }
    return null;
  }).filter(Boolean);

  return {
    url: lhr.finalDisplayedUrl,
    device,
    lcpValue,
    threshold,
    needsImprovement,
    opportunities,
    fetchTime: lhr.fetchTime,
    warnings: lhr.runWarnings?.length ? lhr.runWarnings : undefined,
    runtimeError: lhr.runtimeError,
  };
}
