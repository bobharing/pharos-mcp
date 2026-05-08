import { describe, it, expect } from "bun:test";
import { baseSchemas, coreWebVitalsSchema } from "./schemas";

describe("baseSchemas", () => {
  describe("url validator", () => {
    it("should accept valid HTTP URLs", () => {
      const result = baseSchemas.url.safeParse("http://example.com");
      expect(result.success).toBe(true);
    });

    it("should accept valid HTTPS URLs", () => {
      const result = baseSchemas.url.safeParse("https://example.com");
      expect(result.success).toBe(true);
    });

    it("should reject non-HTTP/HTTPS protocols", () => {
      const result = baseSchemas.url.safeParse("ftp://example.com");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Must be a valid HTTP or HTTPS URL");
      }
    });

    it("should reject invalid URLs", () => {
      const result = baseSchemas.url.safeParse("not-a-url");
      expect(result.success).toBe(false);
    });

    it("should reject malicious URLs", () => {
      const result = baseSchemas.url.safeParse("javascript:alert(1)");
      expect(result.success).toBe(false);
    });
  });

  describe("device validator", () => {
    it("should accept desktop", () => {
      const result = baseSchemas.device.safeParse("desktop");
      expect(result.success).toBe(true);
      expect(result.data).toBe("desktop");
    });

    it("should accept mobile", () => {
      const result = baseSchemas.device.safeParse("mobile");
      expect(result.success).toBe(true);
      expect(result.data).toBe("mobile");
    });

    it("should default to desktop", () => {
      const result = baseSchemas.device.safeParse(undefined);
      expect(result.success).toBe(true);
      expect(result.data).toBe("desktop");
    });

    it("should reject invalid device types", () => {
      const result = baseSchemas.device.safeParse("tablet");
      expect(result.success).toBe(false);
    });
  });

  describe("throttling validator", () => {
    it("should accept boolean values", () => {
      expect(baseSchemas.throttling.safeParse(true).success).toBe(true);
      expect(baseSchemas.throttling.safeParse(false).success).toBe(true);
    });

    it("should default to false", () => {
      const result = baseSchemas.throttling.safeParse(undefined);
      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });
  });

  describe("categories validator", () => {
    it("should accept valid categories", () => {
      const validCategories = ["performance", "accessibility", "best-practices", "seo"];
      const result = baseSchemas.categories.safeParse(validCategories);
      expect(result.success).toBe(true);
    });

    it("should reject invalid categories", () => {
      const result = baseSchemas.categories.safeParse(["invalid-category"]);
      expect(result.success).toBe(false);
    });

    it("should be optional", () => {
      const result = baseSchemas.categories.safeParse(undefined);
      expect(result.success).toBe(true);
    });
  });
});

describe("coreWebVitalsSchema", () => {
  it("should accept valid Core Web Vitals configuration", () => {
    const validConfig = {
      url: "https://example.com",
      device: "mobile" as const,
      includeDetails: true,
      threshold: {
        lcp: 2.5,
        inp: 100,
        cls: 0.1,
      },
    };

    const result = coreWebVitalsSchema.shape.url.safeParse(validConfig.url);
    expect(result.success).toBe(true);
  });

  it("should validate threshold object correctly", () => {
    const thresholdSchema = coreWebVitalsSchema.shape.threshold;

    const validThreshold = {
      lcp: 2.5,
      inp: 100,
      cls: 0.1,
    };

    const result = thresholdSchema.safeParse(validThreshold);
    expect(result.success).toBe(true);
  });

  it("should reject negative threshold values", () => {
    const thresholdSchema = coreWebVitalsSchema.shape.threshold;

    const invalidThreshold = {
      lcp: -1,
    };

    const result = thresholdSchema.safeParse(invalidThreshold);
    expect(result.success).toBe(false);
  });
});

