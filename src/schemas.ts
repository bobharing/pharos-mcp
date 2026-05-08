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
  device: z.enum(["desktop", "mobile"]).describe("Device to emulate (default: desktop)").default("desktop"),
  throttling: z.boolean().describe("Whether to throttle the audit (default: false)").default(false),
  categories: z
    .array(z.enum(["performance", "accessibility", "best-practices", "seo", "agentic-browsing"]).describe("Categories to audit"))
    .optional(),
  includeDetails: z.boolean().describe("Include detailed metrics and recommendations").default(false),
  threshold: z.number().describe("Score threshold (0-100)").min(0).max(100).optional(),
  forceFresh: z.boolean().describe("Bypass cache and force a fresh Lighthouse run").default(false),
};

// Composed schemas for each tool (wrapped in z.object() for proper type inference)
export const auditParamsSchema = z.object({
  url: baseSchemas.url,
  categories: baseSchemas.categories,
  device: baseSchemas.device,
  throttling: baseSchemas.throttling,
  forceFresh: baseSchemas.forceFresh,
  includeDetails: z.boolean().describe("Include detailed per-audit breakdowns for each category").default(false),
  focusCategory: z
    .enum(["performance", "accessibility", "best-practices", "seo", "agentic-browsing"])
    .optional()
    .describe("If set, return detailed audits only for this category"),
});

export const performanceSchema = z.object({
  url: baseSchemas.url,
  device: baseSchemas.device,
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
    .describe("If provided, checks metrics against these budget thresholds"),
});

export const coreWebVitalsSchema = z.object({
  url: baseSchemas.url,
  device: baseSchemas.device,
  forceFresh: baseSchemas.forceFresh,
  includeDetails: baseSchemas.includeDetails,
  threshold: z
    .object({
      lcp: z.number().min(0).optional().describe("Largest Contentful Paint threshold in seconds"),
      inp: z.number().min(0).optional().describe("Interaction to Next Paint threshold in milliseconds (evaluated using Total Blocking Time as a lab proxy)"),
      cls: z.number().min(0).optional().describe("Cumulative Layout Shift threshold"),
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
  forceFresh: baseSchemas.forceFresh,
  resourceTypes: z
    .array(z.enum(["images", "javascript", "css", "fonts", "other"]))
    .optional()
    .describe("Types of resources to analyze"),
  minSize: z.number().min(0).optional().describe("Minimum resource size in KB to include"),
});

export const lcpOpportunitiesSchema = z.object({
  url: baseSchemas.url,
  device: baseSchemas.device,
  forceFresh: baseSchemas.forceFresh,
  includeDetails: baseSchemas.includeDetails,
  threshold: z.number().min(0).optional().describe("LCP threshold in seconds (default: 2.5)"),
});

export const unusedJavaScriptSchema = z.object({
  url: baseSchemas.url,
  device: baseSchemas.device,
  forceFresh: baseSchemas.forceFresh,
  minBytes: z.number().min(0).default(2048).describe("Minimum unused bytes to report (default: 2048)"),
});

export const securityAuditSchema = z.object({
  url: baseSchemas.url,
  forceFresh: baseSchemas.forceFresh,
  checks: z
    .array(z.enum(["https", "mixed-content", "hsts", "csp"]))
    .optional()
    .describe(
      "Specific security checks to perform. 'https', 'mixed-content', and 'hsts' all evaluate the same Lighthouse is-on-https audit. 'csp' evaluates the csp-xss audit.",
    ),
});

export const agenticAuditSchema = z.object({
  url: baseSchemas.url,
  device: baseSchemas.device,
  forceFresh: baseSchemas.forceFresh,
  includeDetails: baseSchemas.includeDetails,
});
