import { RobotsTxtResult, RobotsRule, CrawlerOptions } from './types';
import { normalizeUrl, extractDomain } from './url-safety';

const ROBOTS_TXT_PATH = '/robots.txt';
const USER_AGENT_WILDCARD = '*';

export async function fetchRobotsTxt(baseUrl: string, options: CrawlerOptions = {}): Promise<RobotsTxtResult> {
  const robotsUrl = normalizeUrl(ROBOTS_TXT_PATH, baseUrl);
  const userAgent = options.userAgent || 'InterviewPrepBot/1.0';
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.requestTimeoutMs || 10000);
    
    try {
      const response = await fetch(robotsUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': userAgent },
        redirect: 'manual',
      });

      if (!response.ok) return getDefaultRobotsResult();

      const maxBytes = 512 * 1024;
      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        await response.body?.cancel();
        return getDefaultRobotsResult();
      }

      const reader = response.body?.getReader();
      if (!reader) return getDefaultRobotsResult();
      const decoder = new TextDecoder();
      let bytesRead = 0;
      let text = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytesRead += value.byteLength;
          if (bytesRead > maxBytes) {
            await reader.cancel();
            return getDefaultRobotsResult();
          }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
      return parseRobotsTxt(text, userAgent);
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return getDefaultRobotsResult();
  }
}

function getDefaultRobotsResult(): RobotsTxtResult {
  return {
    allowed: true,
    crawlDelay: undefined,
    sitemaps: [],
    rules: [],
  };
}

export function parseRobotsTxt(content: string, userAgent: string): RobotsTxtResult {
  const lines = content.split('\n').map(line => line.trim());
  const rules: RobotsRule[] = [];
  let currentUserAgent: string | null = null;
  let currentAllow: string[] = [];
  let currentDisallow: string[] = [];
  let crawlDelay: number | undefined;
  const sitemaps: string[] = [];
  let inRelevantSection = false;

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(':');
    const directive = parts[0]?.trim();
    const value = parts.slice(1).join(':').trim();
    
    if (!directive) continue;
    
    const lowerDirective = directive.toLowerCase();

    switch (lowerDirective) {
      case 'user-agent':
        if (currentUserAgent !== null) {
          rules.push({ userAgent: currentUserAgent, allow: currentAllow, disallow: currentDisallow });
        }
        currentUserAgent = value;
        currentAllow = [];
        currentDisallow = [];
        inRelevantSection = matchesUserAgent(currentUserAgent, userAgent);
        break;

      case 'allow':
        if (inRelevantSection && value) {
          currentAllow.push(normalizePath(value));
        }
        break;

      case 'disallow':
        if (inRelevantSection && value) {
          currentDisallow.push(normalizePath(value));
        }
        break;

      case 'crawl-delay':
        if (inRelevantSection) {
          const delay = parseFloat(value);
          if (!isNaN(delay) && delay > 0) {
            crawlDelay = delay * 1000;
          }
        }
        break;

      case 'sitemap':
        if (value) {
          sitemaps.push(value);
        }
        break;
    }
  }

  if (currentUserAgent !== null) {
    rules.push({ userAgent: currentUserAgent, allow: currentAllow, disallow: currentDisallow });
  }

  const relevantRules = rules.filter(r => matchesUserAgent(r.userAgent, userAgent));
  const mergedRules = mergeRules(relevantRules);

  return {
    allowed: true,
    crawlDelay,
    sitemaps,
    rules: mergedRules,
  };
}

function matchesUserAgent(ruleAgent: string, ourAgent: string): boolean {
  const ruleLower = ruleAgent.toLowerCase();
  const ourLower = ourAgent.toLowerCase();
  return ruleLower === USER_AGENT_WILDCARD || ourLower.includes(ruleLower) || ruleLower === ourLower;
}

function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    return '/' + path;
  }
  return path;
}

function mergeRules(rules: RobotsRule[]): RobotsRule[] {
  if (rules.length === 0) return [];
  
  const firstRule = rules[0];
  if (!firstRule) return [];
  
  const merged: RobotsRule = {
    userAgent: firstRule.userAgent,
    allow: [],
    disallow: [],
  };

  for (const rule of rules) {
    merged.allow.push(...rule.allow);
    merged.disallow.push(...rule.disallow);
  }

  merged.allow = Array.from(new Set(merged.allow));
  merged.disallow = Array.from(new Set(merged.disallow));

  return [merged];
}

export function isAllowedByRobots(url: string, robotsResult: RobotsTxtResult): boolean {
  if (!robotsResult.rules || robotsResult.rules.length === 0) {
    return true;
  }

  const parsed = new URL(url);
  const path = parsed.pathname + parsed.search;

  for (const rule of robotsResult.rules) {
    for (const disallow of rule.disallow) {
      if (path.startsWith(disallow)) {
        let allowed = false;
        for (const allow of rule.allow) {
          if (path.startsWith(allow) && allow.length >= disallow.length) {
            allowed = true;
            break;
          }
        }
        if (!allowed) {
          return false;
        }
      }
    }
  }

  return true;
}

export function getCrawlDelay(robotsResult: RobotsTxtResult, options: CrawlerOptions): number {
  if (options.crawlDelayMs) {
    return options.crawlDelayMs;
  }
  return robotsResult.crawlDelay || 1000;
}
