import { PageResult, CrawlResult, CrawlerOptions, DiscoveredLink, RankedLink, PageStatus, RobotsTxtResult, CrawlBudget } from './types';
import { normalizeUrl, validateDestinationUrl, isSameScope, getUrlDepth, extractDomain } from './url-safety';
import { fetchRobotsTxt, isAllowedByRobots, getCrawlDelay } from './robots';
import { extractPageContent } from './extraction';
import { rankDiscoveredLinks, selectResearchSources, filterByBudget } from './ranking';
import pino from 'pino';

const logger = pino({ name: 'crawler' });

const DEFAULT_OPTIONS: Required<CrawlerOptions> = {
  maxPages: 50,
  maxDepth: 3,
  maxConcurrency: 3,
  requestTimeoutMs: 15000,
  totalTimeoutMs: 120000,
  maxResponseSizeBytes: 2 * 1024 * 1024,
  allowedContentTypes: ['text/html', 'application/xhtml+xml'],
  userAgent: 'InterviewPrepBot/1.0 (+https://interview-prep.example/bot)',
  respectRobotsTxt: true,
  crawlDelayMs: 1000,
  enableLocalhost: false,
  jobDescriptionContext: '',
};

interface QueuedUrl {
  url: string;
  depth: number;
  sourceUrl: string;
  priority: number;
}

class CompanyCrawler {
  private opts: Required<CrawlerOptions>;
  private baseUrl: string = '';
  private baseDomain: string = '';
  private robotsResult: RobotsTxtResult;
  private crawlBudget: CrawlBudget;
  private queue: QueuedUrl[] = [];
  private visited: Set<string> = new Set();
  private pages: PageResult[] = [];
  private discoveredLinks: DiscoveredLink[] = [];
  private totalBytes = 0;
  private budgetExhausted = false;
  private startTime: number;

  constructor(options: CrawlerOptions = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    this.startTime = Date.now();
    
    this.robotsResult = { allowed: true, crawlDelay: undefined, sitemaps: [], rules: [] };
    
    this.crawlBudget = {
      maxPages: this.opts.maxPages,
      maxDepth: this.opts.maxDepth,
      maxConcurrency: this.opts.maxConcurrency,
      totalTimeoutMs: this.opts.totalTimeoutMs,
      pagesFetched: 0,
      startTime: this.startTime,
    };
  }

  async initialize(companyUrl: string): Promise<void> {
    const validation = await validateDestinationUrl(companyUrl, this.opts);
    if (!validation.valid) {
      throw new Error(`Invalid company URL: ${validation.error}`);
    }
    
    this.baseUrl = validation.normalized!;
    this.baseDomain = extractDomain(this.baseUrl);
    
    this.robotsResult = { allowed: true, crawlDelay: undefined, sitemaps: [], rules: [] };
    
    if (this.opts.respectRobotsTxt) {
      this.robotsResult = await fetchRobotsTxt(this.baseUrl, this.opts);
    }
    
    this.queue.push({ 
      url: this.baseUrl, 
      depth: 0, 
      sourceUrl: this.baseUrl, 
      priority: 1000 
    });
  }

  async crawl(): Promise<CrawlResult> {
    const crawlDelay = getCrawlDelay(this.robotsResult, this.opts);
    
    while (this.queue.length > 0 && !this.budgetExhausted) {
      const batch = this.queue.splice(0, this.opts.maxConcurrency);
      const results = await Promise.all(batch.map(q => this.fetchPage(q)));
      
      for (const result of results) {
        if (result) {
          this.pages.push(result);
          
          if (result.links && result.status === 'success') {
            for (const link of result.links) {
              const normalized = normalizeUrl(link.url, this.baseUrl);
              if (!normalized || this.visited.has(normalized)) continue;
              if (!isSameScope(normalized, this.baseUrl)) continue;
              
              const linkDepth = getUrlDepth(normalized, this.baseUrl);
              if (linkDepth > this.opts.maxDepth) continue;
              
              const priority = link.relevanceScore || 0;
              this.queue.push({
                url: normalized,
                depth: linkDepth,
                sourceUrl: result.url,
                priority,
              });
            }
          }
        }
      }
      
      this.queue.sort((a, b) => b.priority - a.priority);
      
      if (crawlDelay > 0 && this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, crawlDelay + Math.random() * 200));
      }
    }
    
    const rankedLinks = rankDiscoveredLinks(this.discoveredLinks, this.opts.jobDescriptionContext);
    
    const crawlDurationMs = Date.now() - this.startTime;
    
    logger.info({
      companyUrl: this.baseUrl,
      pagesFetched: this.pages.length,
      totalBytes: this.totalBytes,
      durationMs: crawlDurationMs,
      budgetExhausted: this.budgetExhausted,
    }, 'Crawl completed');
    
    return {
      companyUrl: this.baseUrl,
      pages: this.pages,
      totalPagesFetched: this.pages.length,
      totalBytes: this.totalBytes,
      crawlDurationMs,
      budgetExhausted: this.budgetExhausted,
      robotsTxtUrl: `${this.baseUrl}/robots.txt`,
      robotsTxtContent: this.robotsResult.rules.length > 0 ? JSON.stringify(this.robotsResult.rules) : undefined,
    };
  }

  private async fetchPage(queued: QueuedUrl): Promise<PageResult | null> {
    const { url, depth, sourceUrl } = queued;
    
    if (this.visited.has(url)) return null;
    if (this.crawlBudget.pagesFetched >= this.crawlBudget.maxPages) {
      this.budgetExhausted = true;
      return null;
    }
    if (depth > this.crawlBudget.maxDepth) return null;
    if (Date.now() - this.crawlBudget.startTime > this.crawlBudget.totalTimeoutMs) {
      this.budgetExhausted = true;
      return null;
    }
    
    if (this.opts.respectRobotsTxt && !isAllowedByRobots(url, this.robotsResult)) {
      return this.createPageResult(url, url, '', '', {}, [], 'robots_excluded', 403, 'Disallowed by robots.txt', 0);
    }
    
    this.visited.add(url);
    this.crawlBudget.pagesFetched++;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': this.opts.userAgent },
        redirect: 'follow',
      });
      
      clearTimeout(timeoutId);
      
      const contentType = response.headers.get('content-type') || '';
      if (!this.opts.allowedContentTypes.some(t => contentType.includes(t))) {
        return this.createPageResult(url, url, '', '', {}, [], 'unsupported_content', response.status, `Unsupported content type: ${contentType}`, 0);
      }
      
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > this.opts.maxResponseSizeBytes) {
        return this.createPageResult(url, url, '', '', {}, [], 'content_too_large', response.status, `Content too large: ${contentLength} bytes`, 0);
      }
      
      const html = await response.text();
      
      if (html.length > this.opts.maxResponseSizeBytes) {
        return this.createPageResult(url, url, '', '', {}, [], 'content_too_large', response.status, `Content too large: ${html.length} bytes`, html.length);
      }
      
      const pageResult = await extractPageContent(html, url, this.opts);
      pageResult.statusCode = response.status;
      pageResult.status = response.ok ? 'success' : 'http_error';
      if (!response.ok) {
        pageResult.error = `HTTP ${response.status}`;
      }
      
      this.totalBytes += pageResult.bytes;
      
      for (const link of pageResult.links) {
        link.depth = depth + 1;
        this.discoveredLinks.push(link);
      }
      
      return pageResult;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        return this.createPageResult(url, url, '', '', {}, [], 'timeout', 0, 'Request timeout', 0);
      }
      
      return this.createPageResult(url, url, '', '', {}, [], 'http_error', 0, error instanceof Error ? error.message : String(error), 0);
    }
  }
  
  private createPageResult(
    url: string,
    canonicalUrl: string,
    title: string,
    content: string,
    metadata: Record<string, string>,
    links: DiscoveredLink[],
    status: PageStatus,
    statusCode: number,
    error?: string,
    bytes: number = 0
  ): PageResult {
    return {
      url,
      canonicalUrl,
      title,
      content,
      metadata,
      links,
      status,
      statusCode,
      retrievedAt: new Date(),
      error,
      bytes,
    };
  }
}

export async function crawlCompanySite(
  companyUrl: string,
  options: CrawlerOptions = {}
): Promise<CrawlResult> {
  const crawler = new CompanyCrawler(options);
  await crawler.initialize(companyUrl);
  return crawler.crawl();
}

export async function retrievePage(url: string, options: CrawlerOptions = {}): Promise<PageResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const validation = await validateDestinationUrl(url, opts);
  if (!validation.valid) {
    throw new Error(`Invalid URL: ${validation.error}`);
  }
  
  const targetUrl = validation.normalized!;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.requestTimeoutMs);
  
  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': opts.userAgent },
      redirect: 'follow',
    });
    
    clearTimeout(timeoutId);
    
    const contentType = response.headers.get('content-type') || '';
    if (!opts.allowedContentTypes.some(t => contentType.includes(t))) {
      return createPageResult(targetUrl, targetUrl, '', '', {}, [], 'unsupported_content', response.status, `Unsupported content type: ${contentType}`, 0);
    }
    
    const html = await response.text();
    
    if (html.length > opts.maxResponseSizeBytes) {
      return createPageResult(targetUrl, targetUrl, '', '', {}, [], 'content_too_large', response.status, `Content too large`, html.length);
    }
    
    const pageResult = await extractPageContent(html, targetUrl, opts);
    pageResult.statusCode = response.status;
    pageResult.status = response.ok ? 'success' : 'http_error';
    if (!response.ok) {
      pageResult.error = `HTTP ${response.status}`;
    }
    
    return pageResult;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return createPageResult(targetUrl, targetUrl, '', '', {}, [], 'timeout', 0, 'Request timeout', 0);
    }
    
    return createPageResult(targetUrl, targetUrl, '', '', {}, [], 'http_error', 0, error instanceof Error ? error.message : String(error), 0);
  }
}

function createPageResult(
  url: string,
  canonicalUrl: string,
  title: string,
  content: string,
  metadata: Record<string, string>,
  links: DiscoveredLink[],
  status: PageStatus,
  statusCode: number,
  error?: string,
  bytes: number = 0
): PageResult {
  return {
    url,
    canonicalUrl,
    title,
    content,
    metadata,
    links,
    status,
    statusCode,
    retrievedAt: new Date(),
    error,
    bytes,
  };
}

export { normalizeUrl, validateDestinationUrl, isSameScope, getUrlDepth, extractDomain } from './url-safety';
export { fetchRobotsTxt, isAllowedByRobots, getCrawlDelay, parseRobotsTxt } from './robots';
export { extractPageContent } from './extraction';
export { rankDiscoveredLinks, selectResearchSources, filterByBudget } from './ranking';