import { PageResult, CrawlResult, CrawlerOptions, DiscoveredLink, RankedLink, PageStatus, RobotsTxtResult, CrawlBudget } from './types';
import { normalizeUrl, validateDestinationUrl, isSameScope, getUrlDepth, extractDomain } from './url-safety';
import { fetchRobotsTxt, isAllowedByRobots, getCrawlDelay, parseRobotsTxt } from './robots';
import { extractPageContent } from './extraction';
import { rankDiscoveredLinks, filterByBudget } from './ranking';
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

export async function crawlCompanySite(
  companyUrl: string,
  options: CrawlerOptions = {}
): Promise<CrawlResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  
  const baseValidation = validateDestinationUrl(companyUrl, opts);
  if (!baseValidation.valid) {
    throw new Error(`Invalid company URL: ${baseValidation.error}`);
  }
  
  const baseUrl = baseValidation.normalized!;
  const baseDomain = extractDomain(baseUrl);
  
  let robotsResult: RobotsTxtResult = { allowed: true, crawlDelay: undefined, sitemaps: [], rules: [] };
  if (opts.respectRobotsTxt) {
    robotsResult = await fetchRobotsTxt(baseUrl, opts);
  }
  
  const crawlBudget: CrawlBudget = {
    maxPages: opts.maxPages,
    maxDepth: opts.maxDepth,
    maxConcurrency: opts.maxConcurrency,
    totalTimeoutMs: opts.totalTimeoutMs,
    pagesFetched: 0,
    startTime,
  };
  
  const queue: QueuedUrl[] = [{ url: baseUrl, depth: 0, sourceUrl: baseUrl, priority: 1000 }];
  const visited = new Set<string>();
  const pages: PageResult[] = [];
  const discoveredLinks: DiscoveredLink[] = [];
  let totalBytes = 0;
  let budgetExhausted = false;
  
  const crawlDelay = getCrawlDelay(robotsResult, opts);
  
  async function fetchPage(queued: QueuedUrl): Promise<PageResult | null> {
    const { url, depth, sourceUrl } = queued;
    
    if (visited.has(url)) return null;
    if (crawlBudget.pagesFetched >= crawlBudget.maxPages) {
      budgetExhausted = true;
      return null;
    }
    if (depth > crawlBudget.maxDepth) return null;
    if (Date.now() - crawlBudget.startTime > crawlBudget.totalTimeoutMs) {
      budgetExhausted = true;
      return null;
    }
    
    if (opts.respectRobotsTxt && !isAllowedByRobots(url, robotsResult)) {
      return {
        url,
        canonicalUrl: url,
        title: '',
        content: '',
        metadata: {},
        links: [],
        status: 'robots_excluded',
        statusCode: 403,
        retrievedAt: new Date(),
        error: 'Disallowed by robots.txt',
        bytes: 0,
      };
    }
    
    visited.add(url);
    crawlBudget.pagesFetched++;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.requestTimeoutMs);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': opts.userAgent },
        redirect: 'follow',
      });
      
      clearTimeout(timeoutId);
      
      const contentType = response.headers.get('content-type') || '';
      if (!opts.allowedContentTypes.some(t => contentType.includes(t))) {
        return {
          url,
          canonicalUrl: url,
          title: '',
          content: '',
          metadata: {},
          links: [],
          status: 'unsupported_content',
          statusCode: response.status,
          retrievedAt: new Date(),
          error: `Unsupported content type: ${contentType}`,
          bytes: 0,
        };
      }
      
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > opts.maxResponseSizeBytes) {
        return {
          url,
          canonicalUrl: url,
          title: '',
          content: '',
          metadata: {},
          links: [],
          status: 'content_too_large',
          statusCode: response.status,
          retrievedAt: new Date(),
          error: `Content too large: ${contentLength} bytes`,
          bytes: 0,
        };
      }
      
      const html = await response.text();
      
      if (html.length > opts.maxResponseSizeBytes) {
        return {
          url,
          canonicalUrl: url,
          title: '',
          content: '',
          metadata: {},
          links: [],
          status: 'content_too_large',
          statusCode: response.status,
          retrievedAt: new Date(),
          error: `Content too large: ${html.length} bytes`,
          bytes: html.length,
        };
      }
      
      const pageResult = await extractPageContent(html, url, opts);
      pageResult.statusCode = response.status;
      pageResult.status = response.ok ? 'success' : 'http_error';
      if (!response.ok) {
        pageResult.error = `HTTP ${response.status}`;
      }
      
      totalBytes += pageResult.bytes;
      
      for (const link of pageResult.links) {
        link.depth = depth + 1;
        discoveredLinks.push(link);
      }
      
      return pageResult;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          url,
          canonicalUrl: url,
          title: '',
          content: '',
          metadata: {},
          links: [],
          status: 'timeout',
          statusCode: 0,
          retrievedAt: new Date(),
          error: 'Request timeout',
          bytes: 0,
        };
      }
      
      return {
        url,
        canonicalUrl: url,
        title: '',
        content: '',
        metadata: {},
        links: [],
        status: 'http_error',
        statusCode: 0,
        retrievedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
        bytes: 0,
      };
    }
  }
  
  while (queue.length > 0 && !budgetExhausted) {
    const batch = queue.splice(0, opts.maxConcurrency);
    
    const results = await Promise.all(batch.map(q => fetchPage(q)));
    
    for (const result of results) {
      if (result) {
        pages.push(result);
        
        if (result.links && result.status === 'success') {
          for (const link of result.links) {
            const normalized = normalizeUrl(link.url, baseUrl);
            if (!normalized || visited.has(normalized)) continue;
            if (!isSameScope(normalized, baseUrl)) continue;
            
            const linkDepth = getUrlDepth(normalized, baseUrl);
            if (linkDepth > opts.maxDepth) continue;
            
            const priority = link.relevanceScore || 0;
            queue.push({
              url: normalized,
              depth: linkDepth,
              sourceUrl: result.url,
              priority,
            });
          }
        }
      }
    
    queue.sort((a, b) => b.priority - a.priority);
    
    if (crawlDelay > 0 && queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, crawlDelay + Math.random() * 200));
    }
  }
  
  const rankedLinks = rankDiscoveredLinks(discoveredLinks, opts.jobDescriptionContext);
  
  const crawlDurationMs = Date.now() - startTime;
  
  logger.info({
    companyUrl: baseUrl,
    pagesFetched: pages.length,
    totalBytes,
    durationMs: crawlDurationMs,
    budgetExhausted,
  }, 'Crawl completed');
  
  return {
    companyUrl: baseUrl,
    pages,
    totalPagesFetched: pages.length,
    totalBytes,
    crawlDurationMs,
    budgetExhausted,
    robotsTxtUrl: `${baseUrl}/robots.txt`,
    robotsTxtContent: robotsResult.rules.length > 0 ? JSON.stringify(robotsResult.rules) : undefined,
  };
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
      return {
        url: targetUrl,
        canonicalUrl: targetUrl,
        title: '',
        content: '',
        metadata: {},
        links: [],
        status: 'unsupported_content',
        statusCode: response.status,
        retrievedAt: new Date(),
        error: `Unsupported content type: ${contentType}`,
        bytes: 0,
      };
    }
    
    const html = await response.text();
    
    if (html.length > opts.maxResponseSizeBytes) {
      return {
        url: targetUrl,
        canonicalUrl: targetUrl,
        title: '',
        content: '',
        metadata: {},
        links: [],
        status: 'content_too_large',
        statusCode: response.status,
        retrievedAt: new Date(),
        error: `Content too large`,
        bytes: html.length,
      };
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
      return {
        url: targetUrl,
        canonicalUrl: targetUrl,
        title: '',
        content: '',
        metadata: {},
        links: [],
        status: 'timeout',
        statusCode: 0,
        retrievedAt: new Date(),
        error: 'Request timeout',
        bytes: 0,
      };
    }
    
    return {
      url: targetUrl,
      canonicalUrl: targetUrl,
      title: '',
      content: '',
      metadata: {},
      links: [],
      status: 'http_error',
      statusCode: 0,
      retrievedAt: new Date(),
      error: error instanceof Error ? error.message : String(error),
      bytes: 0,
    };
  }
}

export { normalizeUrl, validateDestinationUrl, isSameScope, getUrlDepth, extractDomain } from './url-safety';
export { fetchRobotsTxt, isAllowedByRobots, getCrawlDelay, parseRobotsTxt } from './robots';
export { extractPageContent } from './extraction';
export { rankDiscoveredLinks, selectResearchSources, filterByBudget } from './ranking';