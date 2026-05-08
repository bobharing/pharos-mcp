import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { LighthouseResult, LighthouseAuditResult } from "../types.ts";
import { SCREEN_DIMENSIONS, THROTTLING_CONFIG, KEY_METRICS } from "./constants.ts";
import { getChromeLaunchConfig, getChromeLaunchOptions, isProfileConfig } from "./chrome.ts";

let remoteAuditLock: Promise<void> = Promise.resolve();

type ChromeInstance = { kill: () => void | Promise<void> };
const activeChromeInstances = new Set<ChromeInstance>();

export function getActiveChromeInstances(): ReadonlySet<ChromeInstance> {
  return activeChromeInstances;
}

async function killChrome(chrome: ChromeInstance, maxRetries = 5): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await chrome.kill();
      return;
    } catch (error) {
      const isEbusy = error instanceof Error && (error as NodeJS.ErrnoException).code === "EBUSY";
      if (isEbusy && attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      } else {
        // Cleanup failure should not surface as an audit error
        return;
      }
    }
  }
}

async function withAuditLock<T>(runAudit: () => Promise<T>): Promise<T> {
  const previous = remoteAuditLock.catch(() => undefined);
  let release: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  remoteAuditLock = previous.then(() => current);
  await previous;

  try {
    return await runAudit();
  } finally {
    release?.();
  }
}

// Helper function to launch Chrome with standard configuration
export async function launchChrome() {
  return chromeLauncher.launch(getChromeLaunchOptions());
}

// Helper function to get screen emulation settings
export function getScreenEmulation(device: "desktop" | "mobile") {
  const dimensions = SCREEN_DIMENSIONS[device];
  return {
    mobile: device !== "desktop",
    width: dimensions.width,
    height: dimensions.height,
    deviceScaleFactor: 1,
    disabled: false,
  };
}

// Helper function to build Lighthouse options
export function buildLighthouseOptions(
  port: number,
  device: "desktop" | "mobile",
  categories?: string[],
  throttling = false,
  disableStorageReset = false,
) {
  return {
    logLevel: "error" as const,
    output: "json" as const,
    onlyCategories: categories,
    port,
    formFactor: device,
    screenEmulation: getScreenEmulation(device),
    throttling: throttling ? THROTTLING_CONFIG.enabled : THROTTLING_CONFIG.disabled,
    ...(disableStorageReset ? { disableStorageReset: true } : {}),
  };
}

// Helper function to run a raw Lighthouse audit
export async function runRawLighthouseAudit(
  url: string,
  categories?: string[],
  device: "desktop" | "mobile" = "desktop",
  throttling = false,
): Promise<LighthouseResult> {
  const chromeConfig = getChromeLaunchConfig();
  const { remoteDebuggingPort } = chromeConfig;
  const disableStorageReset = isProfileConfig(chromeConfig);

  const runAudit = async () => {
    const chrome = remoteDebuggingPort ? null : await launchChrome();
    if (chrome) activeChromeInstances.add(chrome);
    const port = remoteDebuggingPort ?? chrome?.port;

    try {
      if (!port) {
        throw new Error("Failed to resolve Chrome debugging port");
      }

      const options = buildLighthouseOptions(port, device, categories, throttling, disableStorageReset);
      const runnerResult = (await lighthouse(url, options)) as LighthouseResult;

      if (!runnerResult) {
        throw new Error("Failed to run Lighthouse audit");
      }

      return runnerResult;
    } finally {
      if (chrome) {
        activeChromeInstances.delete(chrome);
        await killChrome(chrome);
      }
    }
  };

  return withAuditLock(runAudit);
}

// Helper function to filter audits by category
export function filterAuditsByCategory(lhr: LighthouseResult["lhr"], categoryKey: string) {
  return Object.entries(lhr.audits)
    .filter(([key]) => lhr.categories[categoryKey]?.auditRefs?.some((ref: { id: string }) => ref.id === key))
    .map(([key, audit]) => ({
      id: key,
      title: audit.title,
      description: audit.description,
      score: audit.score,
      scoreDisplayMode: audit.scoreDisplayMode,
      displayValue: audit.displayValue,
    }));
}

// Helper function to format category scores from LHR
export function formatCategoryScores(lhr: LighthouseResult["lhr"]) {
  const auditCategories: Record<string, { title: string; score: number; description: string }> = {};

  for (const [key, category] of Object.entries(lhr.categories)) {
    auditCategories[key] = {
      title: category.title,
      score: Math.round((category.score || 0) * 100),
      description: category.description,
    };
  }

  return auditCategories;
}

// Helper function to extract key metrics from LHR
export function extractKeyMetrics(lhr: LighthouseResult["lhr"]) {
  const metrics: Record<string, { title: string; value: number; displayValue: string; score: number | null }> = {};

  if (lhr.audits) {
    for (const metric of KEY_METRICS) {
      const audit = lhr.audits[metric];
      if (audit) {
        metrics[metric] = {
          title: audit.title,
          value: audit.numericValue || 0,
          displayValue: audit.displayValue || "N/A",
          score: audit.score !== null ? Math.round((audit.score || 0) * 100) : null,
        };
      }
    }
  }

  return metrics;
}

// Main function to run Lighthouse audit with formatted results
export async function runLighthouseAudit(
  url: string,
  categories?: string[],
  device: "desktop" | "mobile" = "desktop",
  throttling = false,
): Promise<LighthouseAuditResult> {
  const runnerResult = await runRawLighthouseAudit(url, categories, device, throttling);
  const { lhr } = runnerResult;

  return {
    url: lhr.finalDisplayedUrl,
    fetchTime: lhr.fetchTime,
    version: lhr.lighthouseVersion,
    userAgent: lhr.userAgent,
    device,
    categories: formatCategoryScores(lhr),
    metrics: extractKeyMetrics(lhr),
  };
}

