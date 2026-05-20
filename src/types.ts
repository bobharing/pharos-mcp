// Types for Lighthouse results
export interface LighthouseCategory {
  title: string;
  score: number;
  description: string;
  auditRefs?: Array<{ id: string; weight?: number; group?: string }>;
}

export interface LighthouseAudit {
  title: string;
  description?: string;
  numericValue?: number;
  displayValue?: string;
  score: number | null;
  scoreDisplayMode?: string;
  details?: {
    items?: Record<string, unknown>[];
    [key: string]: unknown;
  };
}

export interface LhrEntity {
  name: string;
  homepage?: string;
  category?: string;
  isFirstParty?: boolean;
  isUnrecognized?: boolean;
  origins: string[];
}

export interface LhrStackPack {
  id: string;
  title: string;
  iconDataURL?: string;
  descriptions: Record<string, string>;
}

export interface LighthouseResult {
  lhr: {
    finalDisplayedUrl: string;
    fetchTime: string;
    lighthouseVersion: string;
    userAgent: string;
    categories: Record<string, LighthouseCategory>;
    audits: Record<string, LighthouseAudit>;
    runWarnings?: string[];
    runtimeError?: { code: string; message: string };
    entities?: LhrEntity[];
    stackPacks?: LhrStackPack[];
    environment?: {
      hostUserAgent: string;
      networkUserAgent: string;
      benchmarkIndex: number;
    };
  };
}

export interface LighthouseAuditResult {
  url: string;
  fetchTime: string;
  version: string;
  userAgent: string;
  device: string;
  categories: Record<
    string,
    {
      title: string;
      score: number;
      description: string;
    }
  >;
  metrics: Record<
    string,
    {
      title: string;
      value: number;
      displayValue: string;
      score: number | null;
    }
  >;
  warnings?: string[];
  runtimeError?: { code: string; message: string };
}
