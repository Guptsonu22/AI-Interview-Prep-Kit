import { PageResult, DiscoveredLink, PageStatus, CrawlerOptions } from './types';
import { normalizeUrl, isSameScope, getUrlDepth } from './url-safety';

const BOILERPLATE_SELECTORS = [
  'nav', 'header', 'footer', 'aside', '.nav', '.navigation', '.menu',
  '.sidebar', '.widget', '.advertisement', '.ad', '.cookie-banner',
  '.popup', '.modal', '.overlay', 'script', 'style', 'noscript',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '.breadcrumb', '.pagination', '.social-share', '.related-posts'
];

const CONTENT_SELECTORS = [
  'main', 'article', '[role="main"]', '.content', '.main-content',
  '.post-content', '.entry-content', '.article-body', '.page-content',
  '#content', '#main', '.container'
];

export async function extractPageContent(html: string, url: string, options: CrawlerOptions = {}): Promise<PageResult> {
  const parsedUrl = new URL(url);
  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
  
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(html, { url, contentType: 'text/html' });
  const document = dom.window.document;

  const title = extractTitle(document);
  const canonicalUrl = extractCanonicalUrl(document, url);
  const metadata = extractMetadata(document);
  const content = extractReadableText(document);
  const links = extractLinks(document, url, baseUrl);
  
  const bytes = Buffer.byteLength(html, 'utf8');
  const status: PageStatus = 'success';
  const statusCode = 200;

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
    bytes,
  };
}

function extractTitle(document: Document): string {
  const titleEl = document.querySelector('title');
  if (titleEl) return titleEl.textContent?.trim() || '';
  
  const h1 = document.querySelector('h1');
  if (h1) return h1.textContent?.trim() || '';
  
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) return ogTitle.getAttribute('content')?.trim() || '';
  
  return '';
}

function extractCanonicalUrl(document: Document, fallbackUrl: string): string {
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    const href = canonical.getAttribute('href');
    if (href) return normalizeUrl(href, fallbackUrl);
  }
  
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) {
    const content = ogUrl.getAttribute('content');
    if (content) return normalizeUrl(content, fallbackUrl);
  }
  
  return fallbackUrl;
}

function extractMetadata(document: Document): Record<string, string> {
  const metadata: Record<string, string> = {};
  
  const metaTags = document.querySelectorAll('meta');
  for (const meta of Array.from(metaTags)) {
    const name = meta.getAttribute('name') || meta.getAttribute('property');
    const content = meta.getAttribute('content');
    if (name && content) {
      metadata[name] = content;
    }
  }
  
  const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of Array.from(jsonLd)) {
    try {
      const data = JSON.parse(script.textContent || '{}');
      if (data['@type']) {
        metadata['jsonld_type'] = data['@type'];
      }
    } catch {
      // ignore invalid JSON-LD
    }
  }
  
  return metadata;
}

function extractReadableText(document: Document): string {
  const clone = document.cloneNode(true) as Document;
  
  for (const selector of BOILERPLATE_SELECTORS) {
    const elements = clone.querySelectorAll(selector);
    for (const el of Array.from(elements)) {
      el.remove();
    }
  }
  
  let contentElement: Element | null = null;
  
  for (const selector of CONTENT_SELECTORS) {
    contentElement = clone.querySelector(selector);
    if (contentElement) break;
  }
  
  if (!contentElement) {
    contentElement = clone.body;
  }
  
  const text = contentElement.textContent || '';
  return cleanText(text);
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim()
    .slice(0, 50000);
}

function extractLinks(document: Document, sourceUrl: string, baseUrl: string): DiscoveredLink[] {
  const links: DiscoveredLink[] = [];
  const anchors = document.querySelectorAll('a[href]');
  
  for (const anchor of Array.from(anchors)) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    
    const normalizedUrl = normalizeUrl(href, sourceUrl);
    if (!normalizedUrl) continue;
    
    try {
      const linkUrl = new URL(normalizedUrl);
      if (!['http:', 'https:'].includes(linkUrl.protocol)) continue;
      if (!isSameScope(normalizedUrl, baseUrl)) continue;
    } catch {
      continue;
    }
    
    const anchorText = cleanText(anchor.textContent || '');
    const surroundingText = getSurroundingText(anchor);
    const pageTitle = extractTitle(document);
    
    const link: DiscoveredLink = {
      url: normalizedUrl,
      normalizedUrl,
      anchorText: anchorText.slice(0, 200),
      pageTitle,
      surroundingText: surroundingText.slice(0, 500),
      sourceUrl,
      depth: getUrlDepth(normalizedUrl, baseUrl),
      relevanceScore: 0,
      category: undefined,
    };
    
    link.category = classifyLinkCategory(link);
    
    links.push(link);
  }
  
  return deduplicateLinks(links);
}

function getSurroundingText(element: Element): string {
  const parent = element.parentElement;
  if (!parent) return '';
  
  const text = parent.textContent || '';
  const anchorText = element.textContent || '';
  return text.replace(anchorText, '').slice(0, 500);
}

function deduplicateLinks(links: DiscoveredLink[]): DiscoveredLink[] {
  const seen = new Set<string>();
  return links.filter(link => {
    if (seen.has(link.normalizedUrl)) return false;
    seen.add(link.normalizedUrl);
    return true;
  });
}

export function classifyLinkCategory(link: DiscoveredLink): DiscoveredLink['category'] {
  const url = link.normalizedUrl.toLowerCase();
  const anchor = link.anchorText.toLowerCase();
  const surrounding = link.surroundingText.toLowerCase();
  const title = link.pageTitle.toLowerCase();
  const text = `${url} ${anchor} ${surrounding} ${title}`;
  
  const careerKeywords = ['career', 'job', 'hiring', 'recruit', 'position', 'opening', 'apply', 'talent', 'employment'];
  const hiringKeywords = ['interview', 'hiring process', 'recruitment process', 'technical interview', 'coding challenge', 'take-home', 'whiteboard'];
  const engineeringKeywords = ['engineering', 'developer', 'software', 'backend', 'frontend', 'fullstack', 'devops', 'architecture', 'tech stack', 'technology'];
  const interviewKeywords = ['interview', 'preparation', 'questions', 'tips', 'guide', 'how to', 'expect'];
  const cultureKeywords = ['culture', 'values', 'mission', 'team', 'benefits', 'perks', 'life at', 'work at'];
  const aboutKeywords = ['about', 'company', 'mission', 'vision', 'history', 'leadership', 'founder'];
  const blogKeywords = ['blog', 'news', 'article', 'post', 'insight', 'thought leadership'];
  
  if (careerKeywords.some(k => text.includes(k))) return 'careers';
  if (hiringKeywords.some(k => text.includes(k))) return 'hiring_process';
  if (engineeringKeywords.some(k => text.includes(k))) return 'engineering';
  if (interviewKeywords.some(k => text.includes(k))) return 'interview_guidance';
  if (cultureKeywords.some(k => text.includes(k))) return 'culture';
  if (aboutKeywords.some(k => text.includes(k))) return 'about';
  if (blogKeywords.some(k => text.includes(k))) return 'blog';
  
  return 'other';
}