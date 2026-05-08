/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { Mock } from "bun:test";
import { findUnusedJavaScript, analyzeResources, getSecurityAudit, getThirdPartyAnalysis } from "./lib/analysis";
import * as lighthouseCore from "./lib/lighthouse";
import { SECURITY_AUDITS, DEFAULTS } from "./lib/constants";

// Mock the lighthouse module
mock.module("./lib/lighthouse", () => ({
  runRawLighthouseAudit: mock(),
}));

const mockRunRawLighthouseAudit = () => lighthouseCore.runRawLighthouseAudit as unknown as Mock;

describe("lighthouse-analysis", () => {
  const mockUrl = "https://example.com";
  const mockFetchTime = "2024-01-01T00:00:00.000Z";

  beforeEach(() => {
    mockRunRawLighthouseAudit().mockReset();
  });

  describe("findUnusedJavaScript", () => {
    it("should return unused JavaScript analysis", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        audits: {
          "unused-javascript": {
            details: {
              items: [
                {
                  url: "https://example.com/script1.js",
                  totalBytes: 10000,
                  wastedBytes: 5000,
                },
                {
                  url: "https://example.com/script2.js",
                  totalBytes: 8000,
                  wastedBytes: 1500,
                },
              ],
            },
          },
        },
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await findUnusedJavaScript(mockUrl, "desktop", 1000); // Lower threshold to include both

      expect(lighthouseCore.runRawLighthouseAudit).toHaveBeenCalledWith(mockUrl, ["performance"], "desktop", false, undefined);
      expect(result).toEqual({
        url: mockUrl,
        device: "desktop",
        totalUnusedBytes: 6500,
        items: [
          {
            url: "https://example.com/script1.js",
            totalBytes: 10000,
            wastedBytes: 5000,
            wastedPercent: 50,
          },
          {
            url: "https://example.com/script2.js",
            totalBytes: 8000,
            wastedBytes: 1500,
            wastedPercent: 19,
          },
        ],
        fetchTime: mockFetchTime,
      });
    });

    it("should filter by minimum bytes", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        audits: {
          "unused-javascript": {
            details: {
              items: [
                {
                  url: "https://example.com/small.js",
                  totalBytes: 1000,
                  wastedBytes: 500,
                },
                {
                  url: "https://example.com/large.js",
                  totalBytes: 10000,
                  wastedBytes: 5000,
                },
              ],
            },
          },
        },
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await findUnusedJavaScript(mockUrl, "desktop", 1000);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].url).toBe("https://example.com/large.js");
      expect(result.totalUnusedBytes).toBe(5000);
    });

    it("should handle missing unused-javascript audit", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        audits: {},
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await findUnusedJavaScript(mockUrl);

      expect(result).toEqual({
        url: mockUrl,
        device: "desktop",
        totalUnusedBytes: 0,
        items: [],
        fetchTime: mockFetchTime,
      });
    });

    it("should use default minimum bytes", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        audits: {
          "unused-javascript": {
            details: {
              items: [
                {
                  url: "https://example.com/script.js",
                  totalBytes: 5000,
                  wastedBytes: DEFAULTS.MIN_UNUSED_JS_BYTES + 100,
                },
              ],
            },
          },
        },
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await findUnusedJavaScript(mockUrl);

      expect(result.items).toHaveLength(1);
    });

    it("should forward throttling=true to runRawLighthouseAudit", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        audits: { "unused-javascript": { details: { items: [] } } },
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      await findUnusedJavaScript(mockUrl, "mobile", DEFAULTS.MIN_UNUSED_JS_BYTES, true);

      expect(lighthouseCore.runRawLighthouseAudit).toHaveBeenCalledWith(mockUrl, ["performance"], "mobile", true, undefined);
    });
  });

  describe("analyzeResources", () => {
    it("should analyze website resources", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        audits: {
          "network-requests": {
            details: {
              items: [
                {
                  url: "https://example.com/image.jpg",
                  transferSize: 50000,
                  resourceSize: 60000,
                  mimeType: "image/jpeg",
                  resourceType: "image",
                },
                {
                  url: "https://example.com/script.js",
                  transferSize: 30000,
                  resourceSize: 35000,
                  mimeType: "application/javascript",
                  resourceType: "script",
                },
                {
                  url: "https://example.com/style.css",
                  transferSize: 15000,
                  resourceSize: 18000,
                  mimeType: "text/css",
                  resourceType: "stylesheet",
                },
              ],
            },
          },
        },
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await analyzeResources(mockUrl, "desktop", ["images", "javascript"], 10);

      expect(lighthouseCore.runRawLighthouseAudit).toHaveBeenCalledWith(mockUrl, ["performance"], "desktop", false, undefined);
      expect(result.resources).toHaveLength(2); // Only image and javascript
      expect(result.summary).toHaveProperty("images");
      expect(result.summary).toHaveProperty("javascript");
      expect(result.summary.images.count).toBe(1);
      expect(result.summary.javascript.count).toBe(1);
    });

    it("should filter by minimum size", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        audits: {
          "network-requests": {
            details: {
              items: [
                {
                  url: "https://example.com/large.jpg",
                  transferSize: 100000, // 97.66 KB
                  resourceSize: 100000,
                  mimeType: "image/jpeg",
                },
                {
                  url: "https://example.com/small.js",
                  transferSize: 1000, // 0.98 KB
                  resourceSize: 1000,
                  mimeType: "application/javascript",
                },
              ],
            },
          },
        },
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await analyzeResources(mockUrl, "desktop", undefined, 50); // 50KB minimum

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].url).toBe("https://example.com/large.jpg");
    });

    it("should categorize resources by MIME type", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        audits: {
          "network-requests": {
            details: {
              items: [
                { url: "https://example.com/unknown", transferSize: 10000, resourceSize: 10000, mimeType: "image/png" },
                { url: "https://example.com/script", transferSize: 10000, resourceSize: 10000, mimeType: "text/javascript" },
                { url: "https://example.com/style", transferSize: 10000, resourceSize: 10000, mimeType: "text/css" },
                { url: "https://example.com/font.woff2", transferSize: 10000, resourceSize: 10000, mimeType: "font/woff2" },
                { url: "https://example.com/unknown.bin", transferSize: 10000, resourceSize: 10000, mimeType: "application/octet-stream" },
              ],
            },
          },
        },
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await analyzeResources(mockUrl);

      const resourceTypes = result.resources.map((r) => r.resourceType);
      expect(resourceTypes).toContain("images");
      expect(resourceTypes).toContain("javascript");
      expect(resourceTypes).toContain("css");
      expect(resourceTypes).toContain("fonts");
      expect(resourceTypes).toContain("other");
    });

    it("should handle missing network-requests audit", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        audits: {},
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await analyzeResources(mockUrl);

      expect(result).toEqual({
        url: mockUrl,
        device: "desktop",
        resources: [],
        summary: {},
        fetchTime: mockFetchTime,
      });
    });

    it("should forward throttling=true to runRawLighthouseAudit", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        audits: { "network-requests": { details: { items: [] } } },
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      await analyzeResources(mockUrl, "mobile", undefined, DEFAULTS.MIN_RESOURCE_SIZE_KB, true);

      expect(lighthouseCore.runRawLighthouseAudit).toHaveBeenCalledWith(mockUrl, ["performance"], "mobile", true, undefined);
    });
  });

  describe("getSecurityAudit", () => {
    it("should return security audit results", async () => {
      const mockAudits: Record<string, any> = {};
      SECURITY_AUDITS.forEach((auditId, index) => {
        mockAudits[auditId] = {
          title: `Security Audit ${index}`,
          description: `Description for ${auditId}`,
          score: index % 2 === 0 ? 1 : 0.5,
          scoreDisplayMode: "binary",
          displayValue: index % 2 === 0 ? "Passed" : "Failed",
        };
      });

      const mockLhr = { finalDisplayedUrl: mockUrl, fetchTime: mockFetchTime, audits: mockAudits };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await getSecurityAudit(mockUrl);

      expect(lighthouseCore.runRawLighthouseAudit).toHaveBeenCalledWith(mockUrl, ["best-practices"], "desktop", false, undefined);
      expect(result.audits).toHaveLength(SECURITY_AUDITS.length);
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it("should filter by specific checks", async () => {
      const mockAudits: Record<string, any> = {};
      SECURITY_AUDITS.forEach((auditId) => {
        mockAudits[auditId] = {
          title: "Security Audit",
          description: `Description for ${auditId}`,
          score: 1,
          scoreDisplayMode: "binary",
          displayValue: "Passed",
        };
      });

      const mockLhr = { finalDisplayedUrl: mockUrl, fetchTime: mockFetchTime, audits: mockAudits };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await getSecurityAudit(mockUrl, ["https", "csp"]);

      const httpsAudits = result.audits.filter(
        (audit: any) => audit && (audit.id.includes("https") || audit.id.includes("csp")),
      );
      expect(httpsAudits.length).toBeGreaterThan(0);
    });

    it("should handle missing security audits", async () => {
      const mockLhr = { finalDisplayedUrl: mockUrl, fetchTime: mockFetchTime, audits: {} };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await getSecurityAudit(mockUrl);

      expect(result.audits).toEqual([]);
      expect(Number.isNaN(result.overallScore) || result.overallScore === 0).toBe(true);
    });

    it("should calculate overall score correctly", async () => {
      const mockAudits: Record<string, any> = {
        "is-on-https": { title: "HTTPS", description: "Uses HTTPS", score: 1, scoreDisplayMode: "binary", displayValue: "Passed" },
        "csp-xss": { title: "CSP", description: "CSP effective", score: 0, scoreDisplayMode: "binary", displayValue: "Failed" },
      };

      const mockLhr = { finalDisplayedUrl: mockUrl, fetchTime: mockFetchTime, audits: mockAudits };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await getSecurityAudit(mockUrl);

      // Should be 50% (1 + 0) / 2 = 0.5 * 100 = 50
      expect(result.overallScore).toBe(50);
    });

    it("should forward device and throttling=true to runRawLighthouseAudit", async () => {
      const mockLhr = { finalDisplayedUrl: mockUrl, fetchTime: mockFetchTime, audits: {} };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      await getSecurityAudit(mockUrl, undefined, "mobile", true);

      expect(lighthouseCore.runRawLighthouseAudit).toHaveBeenCalledWith(mockUrl, ["best-practices"], "mobile", true, undefined);
    });
  });

  describe("getThirdPartyAnalysis", () => {
    const mockEntities = [
      { name: "First Party", isFirstParty: true, origins: ["https://example.com"] },
      { name: "Google Analytics", category: "analytics", isFirstParty: false, origins: ["https://www.google-analytics.com"] },
      { name: "Facebook Pixel", category: "advertising", isFirstParty: false, origins: ["https://connect.facebook.net"] },
      { name: "Unknown CDN", isFirstParty: false, origins: ["https://cdn.example.org"] },
    ];

    it("should group third-party entities by category", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        entities: mockEntities,
        audits: {
          "third-party-summary": {
            details: {
              items: [
                { entity: "Google Analytics", transferSize: 51200, blockingTime: 120 },
                { entity: "Facebook Pixel", transferSize: 30720, blockingTime: 80 },
              ],
            },
          },
        },
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await getThirdPartyAnalysis(mockUrl, "desktop");

      expect(result.summary.firstPartyCount).toBe(1);
      expect(result.summary.thirdPartyCount).toBe(3);
      expect(result.categories["analytics"]).toBeDefined();
      expect(result.categories["advertising"]).toBeDefined();
      expect(result.categories["analytics"][0].name).toBe("Google Analytics");
      expect(result.categories["analytics"][0].transferKB).toBeCloseTo(50, 0);
      expect(result.categories["analytics"][0].blockingTimeMs).toBe(120);
      expect(result.categories["advertising"][0].name).toBe("Facebook Pixel");
    });

    it("should aggregate totals correctly", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        entities: mockEntities,
        audits: {
          "third-party-summary": {
            details: {
              items: [
                { entity: "Google Analytics", transferSize: 102400, blockingTime: 200 },
                { entity: "Facebook Pixel", transferSize: 51200, blockingTime: 100 },
              ],
            },
          },
        },
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await getThirdPartyAnalysis(mockUrl);

      expect(result.summary.totalThirdPartyKB).toBeCloseTo(150, 0);
      expect(result.summary.totalThirdPartyBlockingMs).toBe(300);
    });

    it("should handle no entities in LHR", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        audits: {},
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await getThirdPartyAnalysis(mockUrl);

      expect(result.summary.firstPartyCount).toBe(0);
      expect(result.summary.thirdPartyCount).toBe(0);
      expect(result.summary.totalThirdPartyKB).toBe(0);
      expect(result.categories).toEqual({});
    });

    it("should include third-party-facades audit IDs in auditsPresent", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        entities: [
          { name: "YouTube", category: "video", isFirstParty: false, origins: ["https://www.youtube.com"] },
        ],
        audits: {
          "third-party-summary": {
            details: {
              items: [{ entity: "YouTube", transferSize: 204800, blockingTime: 500 }],
            },
          },
          "third-party-facades": {
            details: {
              items: [{ entity: "YouTube" }],
            },
          },
        },
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await getThirdPartyAnalysis(mockUrl);

      expect(result.categories["video"][0].auditsPresent).toContain("third-party-summary");
      expect(result.categories["video"][0].auditsPresent).toContain("third-party-facades");
    });

    it("should pass through runWarnings and runtimeError", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        entities: [],
        audits: {},
        runWarnings: ["Page loaded slowly"],
        runtimeError: { code: "NO_FCP", message: "Page never painted" },
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await getThirdPartyAnalysis(mockUrl);

      expect(result.warnings).toEqual(["Page loaded slowly"]);
      expect(result.runtimeError).toEqual({ code: "NO_FCP", message: "Page never painted" });
    });
  });
});