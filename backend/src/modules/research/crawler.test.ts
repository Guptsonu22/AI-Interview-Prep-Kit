import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FixtureServer, createStandardFixtures, createPathPrefixFixtures, createUnsafeFixtures } from './fixtures';
import {
  crawlCompanySite,
  retrievePage,
  normalizeUrl,
  validateDestinationUrl,
  isSameScope,
  getUrlDepth,
  fetchRobotsTxt,
  isAllowedByRobots,
  parseRobotsTxt,
  extractPageContent,
  rankDiscoveredLinks,
  selectResearchSources,
} from './index';

describe('URL Safety', () => {
  describe('normalizeUrl', () => {
    it('normalizes relative URLs against base', () => {
      expect(normalizeUrl('/careers', 'https://example.com')).toBe('https://example.com/careers');
      expect(normalizeUrl('../about', 'https://example.com/careers/')).toBe('https://example.com/about');
    });

    it('strips fragments', () => {
      expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
    });

    it('preserves query parameters', () => {
      expect(normalizeUrl('https://example.com/search?q=test')).toBe('https://example.com/search?q=test');
    });
  });

  describe('validateDestinationUrl', () => {
    it('allows valid HTTP/HTTPS URLs', async () => {
      const result = await validateDestinationUrl('https://example.com');
      expect(result.valid).toBe(true);
      expect(result.isPublic).toBe(true);
    });

    it('rejects non-HTTP protocols', async () => {
      const result = await validateDestinationUrl('ftp://example.com');
      expect(result.valid).toBe(false);
    });

    it('rejects localhost in production', async () => {
      const result = await validateDestinationUrl('http://localhost:3000');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Localhost');
    });

    it('allows localhost when enabled', async () => {
      const result = await validateDestinationUrl('http://localhost:3000', { enableLocalhost: true });
      expect(result.valid).toBe(true);
    });

    it('rejects private TLDs', async () => {
      const result = await validateDestinationUrl('http://internal.corp');
      expect(result.valid).toBe(false);
    });

    it('rejects private and metadata IP literals including IPv6', async () => {
      for (const url of ['http://10.0.0.1', 'http://169.254.169.254/latest/meta-data', 'http://[fd00::1]', 'http://[fe80::1]']) {
        const result = await validateDestinationUrl(url);
        expect(result.valid, url).toBe(false);
      }
    });
  });

  describe('isSameScope', () => {
    it('returns true for same domain', () => {
      expect(isSameScope('https://example.com/careers', 'https://example.com')).toBe(true);
      expect(isSameScope('https://sub.example.com/page', 'https://example.com')).toBe(false);
    });
  });

  describe('getUrlDepth', () => {
    it('calculates depth correctly', () => {
      expect(getUrlDepth('https://example.com', 'https://example.com')).toBe(0);
      expect(getUrlDepth('https://example.com/careers', 'https://example.com')).toBe(1);
      expect(getUrlDepth('https://example.com/careers/engineer', 'https://example.com')).toBe(2);
    });
  });
});

describe('Robots.txt', () => {
  describe('parseRobotsTxt', () => {
    it('parses basic rules', () => {
      const content = `
        User-agent: *
        Disallow: /private/
        Allow: /public/
        Crawl-delay: 2
      `;
      const result = parseRobotsTxt(content, 'TestBot');
      expect(result.rules.length).toBeGreaterThan(0);
      expect(result.crawlDelay).toBe(2000);
    });

    it('handles multiple user agents', () => {
      const content = `
        User-agent: Googlebot
        Disallow: /google/
        User-agent: *
        Disallow: /private/
      `;
      const result = parseRobotsTxt(content, 'TestBot');
      expect(result.rules.some(r => r.disallow.includes('/private/'))).toBe(true);
    });
  });

  describe('isAllowedByRobots', () => {
    it('allows when no rules', () => {
      const robots = { allowed: true, crawlDelay: undefined, sitemaps: [], rules: [] };
      expect(isAllowedByRobots('https://example.com/page', robots)).toBe(true);
    });

    it('respects disallow rules', () => {
      const robots = {
        allowed: true,
        crawlDelay: undefined,
        sitemaps: [],
        rules: [{ userAgent: '*', allow: [], disallow: ['/private/'] }],
      };
      expect(isAllowedByRobots('https://example.com/private/page', robots)).toBe(false);
      expect(isAllowedByRobots('https://example.com/public/page', robots)).toBe(true);
    });

    it('allows when allow overrides disallow', () => {
      const robots = {
        allowed: true,
        crawlDelay: undefined,
        sitemaps: [],
        rules: [{ userAgent: '*', allow: ['/private/public/'], disallow: ['/private/'] }],
      };
      expect(isAllowedByRobots('https://example.com/private/public/page', robots)).toBe(true);
    });
  });
});

describe('Page Extraction', () => {
  it('extracts title from various sources', async () => {
    const html = '<html><head><title>Test Page</title></head><body></body></html>';
    const result = await extractPageContent(html, 'https://example.com');
    expect(result.title).toBe('Test Page');
  });

  it('falls back to h1 when no title', async () => {
    const html = '<html><head></head><body><h1>Main Heading</h1></body></html>';
    const result = await extractPageContent(html, 'https://example.com');
    expect(result.title).toBe('Main Heading');
  });

  it('extracts canonical URL', async () => {
    const html = '<html><head><link rel="canonical" href="https://example.com/canonical"></head><body></body></html>';
    const result = await extractPageContent(html, 'https://example.com/original');
    expect(result.canonicalUrl).toBe('https://example.com/canonical');
  });

  it('extracts metadata', async () => {
    const html = `
      <html>
        <head>
          <meta name="description" content="Test description">
          <meta property="og:title" content="OG Title">
        </head>
        <body></body>
      </html>
    `;
    const result = await extractPageContent(html, 'https://example.com');
    expect(result.metadata.description).toBe('Test description');
    expect(result.metadata['og:title']).toBe('OG Title');
  });

  it('extracts readable text and removes boilerplate', async () => {
    const html = `
      <html>
        <body>
          <nav><a href="/">Nav</a></nav>
          <main><h1>Main Content</h1><p>This is the article text.</p></main>
          <footer>Footer</footer>
          <script>console.log('removed');</script>
        </body>
      </html>
    `;
    const result = await extractPageContent(html, 'https://example.com');
    expect(result.content).toContain('Main Content');
    expect(result.content).toContain('article text');
    expect(result.content).not.toContain('Nav');
    expect(result.content).not.toContain('Footer');
    expect(result.content).not.toContain('removed');
  });

  it('extracts and normalizes links', async () => {
    const html = `
      <html>
        <body>
          <main>
            <a href="/careers">Careers</a>
            <a href="https://example.com/about">About</a>
            <a href="https://other.com">External</a>
          </main>
        </body>
      </html>
    `;
    const result = await extractPageContent(html, 'https://example.com');
    expect(result.links.length).toBe(2);
    expect(result.links.every(l => l.normalizedUrl.startsWith('https://example.com'))).toBe(true);
  });

  it('classifies link categories', async () => {
    const html = `
      <html>
        <body>
          <main>
            <a href="/careers/engineer">Software Engineer Job</a>
            <a href="/about/culture">Our Culture</a>
            <a href="/blog/interview-tips">Interview Tips</a>
          </main>
        </body>
      </html>
    `;
    const result = await extractPageContent(html, 'https://example.com');
    const categories = result.links.map(l => l.category);
    expect(categories).toContain('careers');
    expect(categories).toContain('culture');
    expect(categories).toContain('interview_guidance');
  });
});

describe('Link Ranking', () => {
  it('ranks career links highest', () => {
    const links = [
      { normalizedUrl: 'https://example.com/careers/engineer', anchorText: 'Software Engineer Job', pageTitle: 'Careers', surroundingText: '', sourceUrl: 'https://example.com', depth: 1, relevanceScore: 0, category: 'careers' },
      { normalizedUrl: 'https://example.com/about', anchorText: 'About Us', pageTitle: 'About', surroundingText: '', sourceUrl: 'https://example.com', depth: 1, relevanceScore: 0, category: 'about' },
    ];
    const ranked = rankDiscoveredLinks(links);
    expect(ranked[0].category).toBe('careers');
    expect(ranked[0].finalScore).toBeGreaterThan(ranked[1].finalScore);
  });

  it('uses job description context for ranking', () => {
    const links = [
      { normalizedUrl: 'https://example.com/typescript', anchorText: 'TypeScript', pageTitle: '', surroundingText: '', sourceUrl: 'https://example.com', depth: 1, relevanceScore: 0 },
      { normalizedUrl: 'https://example.com/python', anchorText: 'Python', pageTitle: '', surroundingText: '', sourceUrl: 'https://example.com', depth: 1, relevanceScore: 0 },
    ];
    const ranked = rankDiscoveredLinks(links, 'TypeScript React Node.js');
    expect(ranked[0].normalizedUrl).toContain('typescript');
  });
});

describe('Integration: crawlCompanySite', () => {
  let fixtureServer: FixtureServer;

  beforeAll(async () => {
    fixtureServer = createStandardFixtures();
    await fixtureServer.start();
  });

  afterAll(async () => {
    await fixtureServer.stop();
  });

  beforeEach(() => {
    fixtureServer.clearRequestLog();
  });

  it('crawls homepage and discovers links', async () => {
    const result = await crawlCompanySite(fixtureServer.getUrl(), {
      maxPages: 10,
      maxDepth: 2,
      maxConcurrency: 2,
      enableLocalhost: true,
      respectRobotsTxt: false,
    });

    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.totalPagesFetched).toBeGreaterThan(0);
    expect(result.budgetExhausted).toBe(false);
    
    const homePage = result.pages.find(p => p.url === fixtureServer.getUrl() || p.url === `${fixtureServer.getUrl()}/`);
    expect(homePage).toBeDefined();
    expect(homePage!.title).toBe('Example Corp');
  });

  it('follows redirects', async () => {
    const result = await crawlCompanySite(fixtureServer.getUrl('/old-careers'), {
      maxPages: 5,
      enableLocalhost: true,
      respectRobotsTxt: false,
    });
    
    const careersPage = result.pages.find(p => p.url.includes('/careers'));
    expect(careersPage).toBeDefined();
  });

  it('respects robots.txt when enabled', async () => {
    const result = await crawlCompanySite(fixtureServer.getUrl(), {
      maxPages: 10,
      enableLocalhost: true,
      respectRobotsTxt: true,
    });
    
    const privatePage = result.pages.find(p => p.url.includes('/private/'));
    expect(privatePage?.status).toBe('robots_excluded');
  });

  it('handles 404 pages gracefully', async () => {
    const result = await crawlCompanySite(fixtureServer.getUrl('/nonexistent'), {
      maxPages: 5,
      enableLocalhost: true,
      respectRobotsTxt: false,
    });
    
    const notFoundPage = result.pages.find(p => p.url.includes('/nonexistent'));
    expect(notFoundPage?.status).toBe('http_error');
    expect(notFoundPage?.statusCode).toBe(404);
  });

  it('handles oversized responses', async () => {
    const result = await crawlCompanySite(fixtureServer.getUrl('/large-page'), {
      maxPages: 5,
      enableLocalhost: true,
      respectRobotsTxt: false,
      maxResponseSizeBytes: 1024 * 1024,
    });
    
    const largePage = result.pages.find(p => p.url.includes('/large-page'));
    expect(largePage?.status).toBe('content_too_large');
  });

  it('bounds chunked responses without a Content-Length header', async () => {
    const result = await crawlCompanySite(fixtureServer.getUrl('/large-chunked'), {
      maxPages: 1,
      enableLocalhost: true,
      respectRobotsTxt: false,
      maxResponseSizeBytes: 1024,
    });

    const largePage = result.pages.find(p => p.url.includes('/large-chunked'));
    expect(largePage?.status).toBe('content_too_large');
  });

  it('blocks redirects to cloud metadata IPs before requesting the target', async () => {
    const result = await crawlCompanySite(fixtureServer.getUrl('/redirect-private'), {
      maxPages: 1,
      enableLocalhost: true,
      respectRobotsTxt: false,
    });

    const blockedPage = result.pages.find(p => p.url.includes('/redirect-private'));
    expect(blockedPage?.status).toBe('unsafe_destination');
    expect(fixtureServer.getRequestLog()).toHaveLength(1);
  });

  it('handles timeout', async () => {
    const result = await crawlCompanySite(fixtureServer.getUrl('/slow-page'), {
      maxPages: 5,
      enableLocalhost: true,
      respectRobotsTxt: false,
      requestTimeoutMs: 100,
    });
    
    const slowPage = result.pages.find(p => p.url.includes('/slow-page'));
    expect(slowPage?.status).toBe('timeout');
  });

  it('handles redirect loops', async () => {
    const result = await crawlCompanySite(fixtureServer.getUrl('/redirect-loop-1'), {
      maxPages: 5,
      enableLocalhost: true,
      respectRobotsTxt: false,
    });
    
    const loopPage = result.pages.find(p => p.url.includes('/redirect-loop-1'));
    expect(loopPage?.status).toBe('redirect_loop');
  });

  it('respects path prefix scopes', async () => {
    const prefixServer = createPathPrefixFixtures('/company');
    await prefixServer.start();
    
    try {
      const result = await crawlCompanySite(prefixServer.getUrl('/company/'), {
        maxPages: 10,
        enableLocalhost: true,
        respectRobotsTxt: false,
      });
      
      const allInScope = result.pages.every(p => p.url.includes('/company/'));
      expect(allInScope).toBe(true);
    } finally {
      await prefixServer.stop();
    }
  });

  it('rejects unsafe destinations', async () => {
    const unsafeServer = createUnsafeFixtures();
    await unsafeServer.start();
    
    try {
      const result = await crawlCompanySite(unsafeServer.getUrl(), {
        maxPages: 5,
        enableLocalhost: true,
        respectRobotsTxt: false,
      });
      
      const unsafePage = result.pages.find(p => p.status === 'unsafe_destination' || p.status === 'dns_rebinding');
      expect(unsafePage).toBeDefined();
    } finally {
      await unsafeServer.stop();
    }
  });

  it('returns pages with retrieval metadata', async () => {
    const result = await crawlCompanySite(fixtureServer.getUrl(), {
      maxPages: 5,
      enableLocalhost: true,
      respectRobotsTxt: false,
    });
    
    for (const page of result.pages) {
      expect(page.retrievedAt).toBeInstanceOf(Date);
      expect(typeof page.bytes).toBe('number');
      expect(page.bytes).toBeGreaterThan(0);
      expect(page.statusCode).toBeGreaterThan(0);
    }
  });
});

describe('retrievePage', () => {
  let fixtureServer: FixtureServer;

  beforeAll(async () => {
    fixtureServer = createStandardFixtures();
    await fixtureServer.start();
  });

  afterAll(async () => {
    await fixtureServer.stop();
  });

  it('retrieves a single page successfully', async () => {
    const result = await retrievePage(fixtureServer.getUrl('/careers'), {
      enableLocalhost: true,
    });
    
    expect(result.status).toBe('success');
    expect(result.title).toBe('Careers | Example Corp');
    expect(result.content).toContain('Join Our Team');
  });

  it('handles 404', async () => {
    const result = await retrievePage(fixtureServer.getUrl('/nonexistent'), {
      enableLocalhost: true,
    });
    
    expect(result.status).toBe('http_error');
    expect(result.statusCode).toBe(404);
  });
});

describe('selectResearchSources', () => {
  it('selects top sources from crawled pages', async () => {
    const pages = [
      {
        url: 'https://example.com/careers/engineer',
        links: [
          { normalizedUrl: 'https://example.com/careers/engineer', anchorText: 'Engineer', category: 'careers', relevanceScore: 100, rank: 1 },
          { normalizedUrl: 'https://example.com/about', anchorText: 'About', category: 'about', relevanceScore: 50, rank: 2 },
        ],
      },
    ];
    
    const sources = selectResearchSources(pages, 1);
    expect(sources.length).toBe(1);
    expect(sources[0].normalizedUrl).toContain('engineer');
  });
});
