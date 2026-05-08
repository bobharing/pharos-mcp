/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { Mock } from "bun:test";
import { getCoreWebVitals, compareMobileDesktop, getLcpOpportunities } from "./lib/performance";
import * as lighthouseCore from "./lib/lighthouse";
import { DEFAULTS, LCP_OPPORTUNITIES } from "./lib/constants";

// Mock the lighthouse module
mock.module("./lib/lighthouse", () => ({
  runLighthouseAudit: mock(),
  runRawLighthouseAudit: mock(),
}));

const mockRunLighthouseAudit = () => lighthouseCore.runLighthouseAudit as unknown as Mock;
const mockRunRawLighthouseAudit = () => lighthouseCore.runRawLighthouseAudit as unknown as Mock;

describe("lighthouse-performance", () => {
  const mockUrl = "https://example.com";
  const mockFetchTime = "2024-01-01T00:00:00.000Z";

  const mockMetrics = {
    "first-contentful-paint": { title: "First Contentful Paint", value: 1200, displayValue: "1.2 s", score: 90 },
    "largest-contentful-paint": { title: "Largest Contentful Paint", value: 2500, displayValue: "2.5 s", score: 80 },
    "cumulative-layout-shift": { title: "Cumulative Layout Shift", value: 0.05, displayValue: "0.05", score: 95 },
    "total-blocking-time": { title: "Total Blocking Time", value: 150, displayValue: "150 ms", score: 85 },
    "speed-index": { title: "Speed Index", value: 3000, displayValue: "3.0 s", score: 75 },
  };

  const mockLighthouseResult = {
    url: mockUrl,
    device: "desktop" as const,
    fetchTime: mockFetchTime,
    version: "12.0.0",
    userAgent: "Test Agent",
    categories: {
      performance: { title: "Performance", score: 85, description: "Performance category" },
    },
    metrics: mockMetrics,
  };

  beforeEach(() => {
    mockRunLighthouseAudit().mockReset();
    mockRunRawLighthouseAudit().mockReset();
  });

  describe("getCoreWebVitals", () => {
    it("should return Core Web Vitals without thresholds", async () => {
      mockRunLighthouseAudit().mockResolvedValue(mockLighthouseResult);

      const result = await getCoreWebVitals(mockUrl);

      expect(result).toEqual({
        url: mockUrl,
        device: "desktop",
        coreWebVitals: {
          lcp: mockMetrics["largest-contentful-paint"],
          fcp: mockMetrics["first-contentful-paint"],
          cls: mockMetrics["cumulative-layout-shift"],
          tbt: mockMetrics["total-blocking-time"],
        },
        allMetrics: mockMetrics,
        thresholdResults: null,
        fetchTime: mockFetchTime,
      });
    });

    it("should check against thresholds when provided", async () => {
      mockRunLighthouseAudit().mockResolvedValue(mockLighthouseResult);

      const thresholds = {
        lcp: 3.0, // Pass: 2.5s <= 3.0s
        inp: 100, // Fail: 150ms > 100ms (using TBT as proxy)
        cls: 0.1, // Pass: 0.05 <= 0.1
      };

      const result = await getCoreWebVitals(mockUrl, "mobile", thresholds);

      expect(result.thresholdResults).toEqual({
        lcp: true, // 2.5s <= 3.0s
        inp: false, // 150ms > 100ms
        cls: true, // 0.05 <= 0.1
      });
    });

    it("should handle missing metrics gracefully", async () => {
      const resultWithoutMetrics = { ...mockLighthouseResult, metrics: {} };
      mockRunLighthouseAudit().mockResolvedValue(resultWithoutMetrics);

      const result = await getCoreWebVitals(mockUrl);

      expect(result.coreWebVitals.lcp).toBeUndefined();
      expect(result.coreWebVitals.fcp).toBeUndefined();
      expect(result.coreWebVitals.cls).toBeUndefined();
      expect(result.coreWebVitals.tbt).toBeUndefined();
    });
  });

  describe("compareMobileDesktop", () => {
    it("should compare mobile and desktop performance", async () => {
      const mobileResult = { ...mockLighthouseResult, device: "mobile" as const };
      const desktopResult = { ...mockLighthouseResult, device: "desktop" as const };

      mockRunLighthouseAudit().mockResolvedValueOnce(mobileResult).mockResolvedValueOnce(desktopResult);

      const result = await compareMobileDesktop(mockUrl, ["performance"], true);

      expect(lighthouseCore.runLighthouseAudit).toHaveBeenCalledTimes(2);
      expect(lighthouseCore.runLighthouseAudit).toHaveBeenNthCalledWith(1, mockUrl, ["performance"], "mobile", true, undefined);
      expect(lighthouseCore.runLighthouseAudit).toHaveBeenNthCalledWith(2, mockUrl, ["performance"], "desktop", true, undefined);

      expect(result).toMatchObject({
        url: mockUrl,
        mobile: { categories: mobileResult.categories, metrics: mobileResult.metrics },
        desktop: { categories: desktopResult.categories, metrics: desktopResult.metrics },
      });

      expect(result.differences.performance).toEqual({ mobile: 85, desktop: 85, difference: 0 });
    });

    it("should handle different scores between devices", async () => {
      const mobileResult = {
        ...mockLighthouseResult,
        device: "mobile" as const,
        categories: { performance: { title: "Performance", score: 75, description: "Performance category" } },
      };
      const desktopResult = {
        ...mockLighthouseResult,
        device: "desktop" as const,
        categories: { performance: { title: "Performance", score: 85, description: "Performance category" } },
      };

      mockRunLighthouseAudit().mockResolvedValueOnce(mobileResult).mockResolvedValueOnce(desktopResult);

      const result = await compareMobileDesktop(mockUrl);

      expect(result.differences.performance).toEqual({ mobile: 75, desktop: 85, difference: 10 });
    });
  });

  describe("getLcpOpportunities", () => {
    it("should return LCP optimization opportunities", async () => {
      const mockAudits: Record<string, any> = {
        "largest-contentful-paint": { numericValue: 3000 },
      };

      LCP_OPPORTUNITIES.forEach((auditId, index) => {
        mockAudits[auditId] = {
          title: `Opportunity ${index}`,
          description: `Description for ${auditId}`,
          score: index % 2 === 0 ? 0.5 : 0.8,
          displayValue: `${index * 100}ms potential savings`,
          numericValue: index * 100,
        };
      });

      const mockLhr = { finalDisplayedUrl: mockUrl, fetchTime: mockFetchTime, audits: mockAudits };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await getLcpOpportunities(mockUrl, "desktop", 2.5);

      expect(lighthouseCore.runRawLighthouseAudit).toHaveBeenCalledWith(mockUrl, ["performance"], "desktop", false, undefined);
      expect(result).toMatchObject({
        url: mockUrl,
        device: "desktop",
        lcpValue: 3.0,
        threshold: 2.5,
        needsImprovement: true,
        fetchTime: mockFetchTime,
      });

      expect(result.opportunities.length).toBeGreaterThan(0);
      expect(result.opportunities.every((opp: any) => opp.score < 1)).toBe(true);
    });

    it("should use default threshold", async () => {
      const mockLhr = {
        finalDisplayedUrl: mockUrl,
        fetchTime: mockFetchTime,
        audits: { "largest-contentful-paint": { numericValue: 2000 } },
      };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await getLcpOpportunities(mockUrl);

      expect(result.threshold).toBe(DEFAULTS.LCP_THRESHOLD);
      expect(result.lcpValue).toBe(2.0);
      expect(result.needsImprovement).toBe(false);
    });

    it("should handle missing LCP audit", async () => {
      const mockLhr = { finalDisplayedUrl: mockUrl, fetchTime: mockFetchTime, audits: {} };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await getLcpOpportunities(mockUrl);

      expect(result.lcpValue).toBe(0);
      expect(result.needsImprovement).toBe(false);
      expect(result.opportunities).toEqual([]);
    });

    it("should filter opportunities with perfect scores", async () => {
      const mockAudits: Record<string, any> = {
        "largest-contentful-paint": { numericValue: 3000 },
        "render-blocking-resources": {
          title: "Render Blocking Resources",
          description: "Remove render-blocking resources",
          score: 1,
          displayValue: "0ms potential savings",
          numericValue: 0,
        },
        "unused-css-rules": {
          title: "Unused CSS",
          description: "Remove unused CSS",
          score: 0.5,
          displayValue: "200ms potential savings",
          numericValue: 200,
        },
      };

      const mockLhr = { finalDisplayedUrl: mockUrl, fetchTime: mockFetchTime, audits: mockAudits };

      mockRunRawLighthouseAudit().mockResolvedValue({ lhr: mockLhr } as any);

      const result = await getLcpOpportunities(mockUrl);

      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0]?.title).toBe("Unused CSS");
    });
  });
});