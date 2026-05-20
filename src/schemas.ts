import { z } from "zod";

// Enhanced URL validation with security checks
const urlValidator = z
  .string()
  .describe("URL to audit")
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        // Only allow HTTP and HTTPS protocols
        return ["http:", "https:"].includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    {
      message: "Must be a valid HTTP or HTTPS URL",
    },
  );

// Reusable base schema components
export const baseSchemas = {
  url: urlValidator,
  device: z.enum(["desktop", "mobile"]).describe("Device to emulate").default("desktop"),
  throttling: z.boolean().describe("Enable network/CPU throttling").default(false),
  categories: z
    .array(z.enum(["performance", "accessibility", "best-practices", "seo", "agentic-browsing"]).describe("Categories to audit"))
    .optional(),
  includeDetails: z.boolean().describe("Include detailed metrics and recommendations").default(false),
  threshold: z.number().describe("Score threshold (0-100)").min(0).max(100).optional(),
  forceFresh: z.boolean().describe("Skip cache; force fresh audit").default(false),
};

// Composed schemas for each tool (wrapped in z.object() for proper type inference)
export const auditParamsSchema = z.object({
  url: baseSchemas.url,
  categories: baseSchemas.categories,
  device: baseSchemas.device,
  throttling: baseSchemas.throttling,
  forceFresh: baseSchemas.forceFresh,
  includeDetails: z.boolean().describe("Include per-audit breakdowns").default(false),
  includeDescriptions: z.boolean().describe("Include audit descriptions in per-audit breakdowns (verbose)").default(false),
  focusCategory: z
    .enum(["performance", "accessibility", "best-practices", "seo", "agentic-browsing"])
    .optional()
    .describe("Return detailed audits for this category only"),
});

export const performanceSchema = z.object({
  url: baseSchemas.url,
  device: baseSchemas.device,
  throttling: baseSchemas.throttling,
  forceFresh: baseSchemas.forceFresh,
  budget: z
    .object({
      performanceScore: baseSchemas.threshold,
      firstContentfulPaint: z.number().min(0).optional().describe("FCP budget in milliseconds"),
      largestContentfulPaint: z.number().min(0).optional().describe("LCP budget in milliseconds"),
      totalBlockingTime: z.number().min(0).optional().describe("TBT budget in milliseconds"),
      cumulativeLayoutShift: z.number().min(0).optional().describe("CLS budget"),
      speedIndex: z.number().min(0).optional().describe("Speed Index budget in milliseconds"),
    })
    .optional()
    .describe("Check metrics against these budgets"),
});

export const coreWebVitalsSchema = z.object({
  url: baseSchemas.url,
  device: baseSchemas.device,
  throttling: baseSchemas.throttling,
  forceFresh: baseSchemas.forceFresh,
  includeDetails: baseSchemas.includeDetails,
  threshold: z
    .object({
      lcp: z.number().min(0).optional().describe("LCP threshold in seconds"),
      inp: z.number().min(0).optional().describe("INP threshold in ms (TBT used as lab proxy)"),
      cls: z.number().min(0).optional().describe("CLS threshold"),
    })
    .optional(),
});

export const compareDevicesSchema = z.object({
  url: baseSchemas.url,
  categories: baseSchemas.categories,
  throttling: baseSchemas.throttling,
  forceFresh: baseSchemas.forceFresh,
  includeDetails: baseSchemas.includeDetails,
});

export const resourceAnalysisSchema = z.object({
  url: baseSchemas.url,
  device: baseSchemas.device,
  throttling: baseSchemas.throttling,
  forceFresh: baseSchemas.forceFresh,
  resourceTypes: z
    .array(z.enum(["images", "javascript", "css", "fonts", "other"]))
    .optional()
    .describe("Resource types to analyze"),
  minSize: z.number().min(0).optional().describe("Min resource size in KB"),
});

export const lcpOpportunitiesSchema = z.object({
  url: baseSchemas.url,
  device: baseSchemas.device,
  throttling: baseSchemas.throttling,
  forceFresh: baseSchemas.forceFresh,
  includeDetails: baseSchemas.includeDetails,
  threshold: z.number().min(0).optional().describe("LCP threshold in seconds (default: 2.5)"),
});

export const unusedJavaScriptSchema = z.object({
  url: baseSchemas.url,
  device: baseSchemas.device,
  throttling: baseSchemas.throttling,
  forceFresh: baseSchemas.forceFresh,
  minBytes: z.number().min(0).default(2048).describe("Min unused bytes (default: 2048)"),
});

export const securityAuditSchema = z.object({
  url: baseSchemas.url,
  device: baseSchemas.device,
  throttling: baseSchemas.throttling,
  forceFresh: baseSchemas.forceFresh,
  checks: z
    .array(z.enum(["https", "mixed-content", "hsts", "csp"]))
    .optional()
    .describe(
      "https/mixed-content/hsts all map to is-on-https; csp maps to csp-xss.",
    ),
});

export const agenticAuditSchema = z.object({
  url: baseSchemas.url,
  device: baseSchemas.device,
  throttling: baseSchemas.throttling,
  forceFresh: baseSchemas.forceFresh,
  includeDetails: baseSchemas.includeDetails,
});

export const thirdPartySchema = z.object({
  url: baseSchemas.url,
  device: baseSchemas.device,
  throttling: baseSchemas.throttling,
  forceFresh: baseSchemas.forceFresh,
  includeDetails: baseSchemas.includeDetails,
});
