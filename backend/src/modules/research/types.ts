export interface CrawlerOptions {
  maxPages?: number;
  maxDepth?: number;
  maxConcurrency?: number;
  requestTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxResponseSizeBytes?: number;
  allowedContentTypes?: string[];
  userAgent?: string;
  respectRobotsTxt?: boolean;
  crawlDelayMs?: number;
  enableLocalhost?: boolean;
  jobDescriptionContext?: string;
}

export interface PageResult {
  url: string;
  canonicalUrl: string;
  title: string;
  content: string;
  metadata: Record<string, string>;
  links: DiscoveredLink[];
  status: PageStatus;
  statusCode: number;
  retrievedAt: Date;
  error?: string;
  bytes: number;
}

export type PageStatus = 
  | 'success'
  | 'robots_excluded'
  | 'timeout'
  | 'http_error'
  | 'unsupported_content'
  | 'crawl_budget_exhausted'
  | 'unsafe_destination'
  | 'redirect_loop'
  | 'dns_rebinding'
  | 'content_too_large'
  | 'malformed_html';

export interface DiscoveredLink {
  url: string;
  normalizedUrl: string;
  anchorText: string;
  pageTitle: string;
  surroundingText: string;
  sourceUrl: string;
  depth: number;
  relevanceScore: number;
  category?: LinkCategory;
}

export type LinkCategory = 
  | 'careers'
  | 'hiring_process'
  | 'engineering'
  | 'interview_guidance'
  | 'culture'
  | 'about'
  | 'blog'
  | 'other';

export interface CrawlResult {
  companyUrl: string;
  pages: PageResult[];
  totalPagesFetched: number;
  totalBytes: number;
  crawlDurationMs: number;
  budgetExhausted: boolean;
  robotsTxtUrl?: string;
  robotsTxtContent?: string;
}

export interface RobotsTxtResult {
  allowed: boolean;
  crawlDelay?: number;
  sitemaps: string[];
  rules: RobotsRule[];
}

export interface RobotsRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
}

export interface RankedLink extends DiscoveredLink {
  finalScore: number;
  rank: number;
}

export interface ResearchSource {
  url: string;
  title: string;
  content: string;
  relevanceScore: number;
  category: LinkCategory;
  retrievedAt: Date;
}

export interface URLValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
  isPublic?: boolean;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

export interface CrawlBudget {
  maxPages: number;
  maxDepth: number;
  maxConcurrency: number;
  totalTimeoutMs: number;
  pagesFetched: number;
  startTime: number;
}