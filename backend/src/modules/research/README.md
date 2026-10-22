# Company Research Crawler

A secure, respectful web crawler for gathering company information from public websites.

## Safety Model

### URL Validation
- Only HTTP and HTTPS protocols allowed
- DNS rebinding protection: resolves hostnames and rejects private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, link-local, loopback)
- Localhost allowed only when `enableLocalhost: true` (for testing)
- Private TLDs blocked (.local, .internal, .corp, .home, .lan)
- Redirect chain validation with loop detection (max 10 redirects)

### Request Safety
- Connection timeout: 15 seconds (configurable)
- Total crawl timeout: 120 seconds (configurable)
- Max response size: 2MB (configurable)
- Allowed content types: text/html, application/xhtml+xml
- User-Agent: `InterviewPrepBot/1.0 (+https://interview-prep.example/bot)`

### Redirect Handling
- Follows redirects up to 10 hops
- Re-validates every redirect destination against safety rules
- Detects redirect loops and reports `redirect_loop` status

## Robots.txt Compliance

- Fetches `/robots.txt` before crawling
- Parses User-Agent, Allow, Disallow, Crawl-delay, Sitemap directives
- Respects crawl-delay (default 1 second, configurable)
- Skips disallowed paths unless explicitly allowed
- Records robots.txt content in crawl results

## Crawl Budget

### Limits (Configurable)
- Max pages: 50 (default)
- Max depth: 3 levels from seed URL
- Max concurrency: 3 parallel requests
- Total timeout: 120 seconds
- Per-domain rate limit: enforced by crawl-delay

### Budget Exhaustion
When any limit is reached:
- Crawling stops gracefully
- Returns `budgetExhausted: true` in results
- Returns all pages fetched so far
- Logs budget exhaustion reason

## Link Ranking

Discovered links are ranked by relevance using:
1. **Category weight** (careers=1.0, hiring_process=0.95, engineering=0.9, interview_guidance=0.85, culture=0.8, about=0.7, blog=0.6, other=0.3)
2. **URL path keywords** (e.g., /careers/, /jobs/, /hiring/)
3. **Anchor text** (e.g., "join us", "careers", "hiring process")
4. **Surrounding text** (context around the link)
5. **Page title** of source page
6. **Depth penalty** (shallow links preferred)
7. **Job description context** (optional, for personalized ranking)

Categories: careers, hiring_process, engineering, interview_guidance, culture, about, blog, other

## Page Extraction

- Removes boilerplate: nav, header, footer, aside, scripts, styles, ads, cookies, popups
- Targets content areas: main, article, [role="main"], .content, .main-content, etc.
- Extracts: title, canonical URL, meta tags, JSON-LD, readable text, outbound links
- Handles malformed HTML gracefully via JSDOM
- Removes scripts, styles, navigation noise

## Honest Reporting

Each page result includes:
- `status`: success | robots_excluded | timeout | http_error | unsupported_content | content_too_large | crawl_budget_exhausted | unsafe_destination | redirect_loop | dns_rebinding | malformed_html
- `statusCode`: HTTP status code
- `error`: error message (if any)
- `bytes`: response size
- `retrievedAt`: timestamp

Missing pages (e.g., robots-excluded) are reported as partial results, not failures.
No facts are fabricated; only actually retrieved pages are reported.

## Interfaces

```typescript
// Main crawl function
crawlCompanySite(companyUrl: string, options?: CrawlerOptions): Promise<CrawlResult>

// Single page retrieval
retrievePage(url: string, options?: CrawlerOptions): Promise<PageResult>

// Link ranking
rankDiscoveredLinks(links: DiscoveredLink[], context?: string): RankedLink[]

// Source selection
selectResearchSources(pages: PageResult[], maxSources?: number): DiscoveredLink[]
```

## Configuration

```typescript
interface CrawlerOptions {
  maxPages?: number;           // default: 50
  maxDepth?: number;           // default: 3
  maxConcurrency?: number;     // default: 3
  requestTimeoutMs?: number;   // default: 15000
  totalTimeoutMs?: number;     // default: 120000
  maxResponseSizeBytes?: number; // default: 2MB
  allowedContentTypes?: string[]; // default: ['text/html', 'application/xhtml+xml']
  userAgent?: string;          // default: 'InterviewPrepBot/1.0'
  respectRobotsTxt?: boolean;  // default: true
  crawlDelayMs?: number;       // default: 1000
  enableLocalhost?: boolean;   // default: false (test only)
  jobDescriptionContext?: string; // for link ranking
}
```

## Test Fixtures

The test suite includes a local HTTP fixture server (`fixtures.ts`) with:
- Standard site structure (home, about, careers, blog)
- Path prefix support (/company/...)
- Robots.txt with Disallow rules
- Redirect chains and redirect loops
- 404 pages
- Oversized responses (>2MB)
- Slow responses (timeout testing)
- Unsafe destinations (localhost, private IPs)
- Path prefix scopes

## Security Notes

- Never fetches arbitrary local services in production
- Localhost fixtures only enabled with explicit `enableLocalhost: true`
- All external requests validated against private IP ranges
- DNS resolution happens before each request (re-validates on redirect)
- No credentials or cookies sent with requests
- Results sanitized (no raw HTML stored beyond extracted content)