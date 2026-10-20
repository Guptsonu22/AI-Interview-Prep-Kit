import { DiscoveredLink, RankedLink, CrawlerOptions } from './types';

const CATEGORY_WEIGHTS: Record<string, number> = {
  careers: 1.0,
  hiring_process: 0.95,
  engineering: 0.9,
  interview_guidance: 0.85,
  culture: 0.8,
  about: 0.7,
  blog: 0.6,
  other: 0.3,
};

const URL_PATH_KEYWORDS = {
  careers: ['career', 'job', 'hiring', 'recruit', 'talent', 'employment', 'position', 'opening'],
  hiring_process: ['interview', 'hiring-process', 'recruitment-process', 'technical-interview', 'coding-challenge'],
  engineering: ['engineering', 'developer', 'software', 'backend', 'frontend', 'fullstack', 'devops', 'architecture', 'tech'],
  interview_guidance: ['interview', 'preparation', 'questions', 'tips', 'guide', 'how-to', 'expect'],
  culture: ['culture', 'values', 'mission', 'team', 'benefits', 'perks', 'life-at', 'work-at'],
  about: ['about', 'company', 'mission', 'vision', 'history', 'leadership', 'founder', 'story'],
  blog: ['blog', 'news', 'article', 'post', 'insight', 'thought-leadership'],
};

const ANCHOR_KEYWORDS = {
  careers: ['career', 'job', 'hiring', 'join us', 'work with us', 'open positions', 'apply now', 'we\'re hiring'],
  hiring_process: ['interview process', 'hiring process', 'recruitment process', 'technical interview', 'coding challenge'],
  engineering: ['engineering', 'software engineering', 'developer', 'tech stack', 'architecture'],
  interview_guidance: ['interview tips', 'interview questions', 'interview preparation', 'how to prepare'],
  culture: ['culture', 'values', 'team culture', 'company culture', 'life at'],
  about: ['about us', 'about', 'our story', 'mission', 'vision', 'leadership'],
  blog: ['read more', 'read article', 'blog post', 'news'],
};

export function rankDiscoveredLinks(links: DiscoveredLink[], context?: string): RankedLink[] {
  const scoredLinks = links.map(link => {
    let score = 0;
    
    score += scoreByCategory(link);
    score += scoreByUrl(link);
    score += scoreByAnchorText(link);
    score += scoreBySurroundingText(link);
    score += scoreByPageTitle(link);
    score += scoreByDepth(link);
    score += scoreByContext(link, context);
    
    return { ...link, finalScore: score, rank: 0 };
  });

  scoredLinks.sort((a, b) => b.finalScore - a.finalScore);
  
  return scoredLinks.map((link, index) => ({
    ...link,
    rank: index + 1,
  }));
}

function scoreByCategory(link: DiscoveredLink): number {
  if (!link.category) return 0;
  return (CATEGORY_WEIGHTS[link.category] || 0.3) * 100;
}

function scoreByUrl(link: DiscoveredLink): number {
  let score = 0;
  const url = link.normalizedUrl.toLowerCase();
  const path = new URL(link.normalizedUrl).pathname.toLowerCase();
  
  for (const [category, keywords] of Object.entries(URL_PATH_KEYWORDS)) {
    const weight = CATEGORY_WEIGHTS[category] || 0.3;
    for (const keyword of keywords) {
      if (path.includes(keyword) || url.includes(keyword)) {
        score += weight * 50;
      }
    }
  }
  
  if (path.split('/').filter(Boolean).length <= 2) {
    score += 10;
  }
  
  return Math.min(score, 100);
}

function scoreByAnchorText(link: DiscoveredLink): number {
  let score = 0;
  const anchor = link.anchorText.toLowerCase();
  
  for (const [category, keywords] of Object.entries(ANCHOR_KEYWORDS)) {
    const weight = CATEGORY_WEIGHTS[category] || 0.3;
    for (const keyword of keywords) {
      if (anchor.includes(keyword)) {
        score += weight * 30;
      }
    }
  }
  
  return Math.min(score, 80);
}

function scoreBySurroundingText(link: DiscoveredLink): number {
  let score = 0;
  const text = link.surroundingText.toLowerCase();
  
  const relevantTerms = [
    'interview', 'hiring', 'career', 'job', 'engineering', 'developer',
    'technical', 'coding', 'software', 'team', 'culture', 'values'
  ];
  
  for (const term of relevantTerms) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    const matches = text.match(regex);
    if (matches) {
      score += matches.length * 5;
    }
  }
  
  return Math.min(score, 50);
}

function scoreByPageTitle(link: DiscoveredLink): number {
  let score = 0;
  const title = link.pageTitle.toLowerCase();
  
  const relevantTerms = [
    'career', 'job', 'hiring', 'interview', 'engineering', 'developer',
    'software', 'team', 'culture', 'about', 'company'
  ];
  
  for (const term of relevantTerms) {
    if (title.includes(term)) {
      score += 15;
    }
  }
  
  return Math.min(score, 60);
}

function scoreByDepth(link: DiscoveredLink): number {
  return Math.max(0, 30 - link.depth * 10);
}

function scoreByContext(link: DiscoveredLink, context?: string): number {
  if (!context) return 0;
  
  let score = 0;
  const contextLower = context.toLowerCase();
  const text = `${link.anchorText} ${link.surroundingText} ${link.pageTitle} ${link.normalizedUrl}`.toLowerCase();
  
  const contextTerms = contextLower
    .split(/\s+/)
    .filter(t => t.length > 3)
    .slice(0, 20);
  
  for (const term of contextTerms) {
    if (text.includes(term)) {
      score += 10;
    }
  }
  
  return Math.min(score, 100);
}

export function selectResearchSources(pages: any[], maxSources: number = 20): any[] {
  const allLinks: DiscoveredLink[] = [];
  
  for (const page of pages) {
    if (page.links) {
      allLinks.push(...page.links);
    }
  }
  
  const ranked = rankDiscoveredLinks(allLinks);
  return ranked.slice(0, maxSources);
}

export function filterByBudget(
  links: RankedLink[], 
  budget: { maxPages: number; maxDepth: number; pagesFetched: number }
): RankedLink[] {
  return links
    .filter(l => l.depth <= budget.maxDepth)
    .slice(0, budget.maxPages - budget.pagesFetched);
}