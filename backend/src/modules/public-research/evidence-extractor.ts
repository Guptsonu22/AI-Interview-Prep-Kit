import { ResearchEvidence, ExtractedClaim, InterviewAspect, EvidenceSourceType, CredibilityLevel, AspectType, SearchResult, ResearchOptions } from './types';

const FIRST_PARTY_PATTERNS = [
  /\/careers(\/|$)/,
  /\/jobs(\/|$)/,
  /\/engineering(\/|$)/,
  /\/blog(\/|$)/,
  /\/tech(\/|$)/,
  /\/press-release(\/|$)/,
  /\/press\//,
  /careers\./,
  /jobs\./,
  /engineering\./,
  /blog\./,
  /tech\./,
  /inurl:careers/,
  /inurl:jobs/,
  /inurl:engineering/,
];

const THIRD_PARTY_DOMAINS: Record<string, EvidenceSourceType> = {
  'glassdoor.com': 'glassdoor',
  'indeed.com': 'indeed',
  'levels.fyi': 'levels_fyi',
  'blindapp.com': 'blind',
  'blind.com': 'blind',
  'reddit.com': 'reddit',
  'news.ycombinator.com': 'hacker_news',
  'linkedin.com': 'linkedin',
  'quora.com': 'quora',
  'stackoverflow.com': 'stackoverflow',
  'github.com': 'github_discussions',
  'youtube.com': 'youtube',
};

const CREDIBILITY_BY_SOURCE: Record<EvidenceSourceType, CredibilityLevel> = {
  official_hiring_page: 'official',
  company_blog: 'official',
  engineering_blog: 'official',
  careers_page: 'official',
  press_release: 'official',
  glassdoor: 'medium',
  indeed: 'medium',
  levels_fyi: 'high',
  blind: 'low',
  reddit: 'low',
  hacker_news: 'medium',
  linkedin: 'medium',
  quora: 'low',
  stackoverflow: 'medium',
  github_discussions: 'medium',
  personal_blog: 'low',
  youtube: 'low',
  unknown: 'unverified',
};

const ASPECT_KEYWORDS: Record<AspectType, string[]> = {
  round_count: ['round', 'stage', 'step', 'phase', 'number of interviews'],
  technical_depth: ['technical', 'algorithm', 'data structure', 'complexity', 'big o'],
  coding_focus: ['code', 'coding', 'program', 'implementation', 'leetcode', 'hackerrank'],
  system_design: ['system design', 'architecture', 'scalability', 'distributed', 'microservice'],
  behavioral_focus: ['behavioral', 'culture', 'values', 'soft skill', 'leadership'],
  culture_fit: ['culture fit', 'values', 'mission', 'team culture', 'work environment'],
  take_home: ['take home', 'take-home', 'homework', 'project', 'assignment'],
  whiteboard: ['whiteboard', 'whiteboarding', 'diagram', 'draw'],
  pair_programming: ['pair program', 'pairing', 'collaborative coding'],
  phone_screen: ['phone screen', 'phone interview', 'recruiter screen', 'initial call'],
  onsite_structure: ['onsite', 'on-site', 'in-person', 'final round', 'final interview'],
  offer_timeline: ['offer', 'timeline', 'feedback', 'decision', 'week', 'days'],
  difficulty_rating: ['difficult', 'hard', 'easy', 'challenging', 'rating', 'scale'],
  interviewer_types: ['engineer', 'manager', 'director', 'vp', 'peer', 'cross-functional'],
};

export function classifySourceType(result: SearchResult): EvidenceSourceType {
  const url = result.url.toLowerCase();
  
  for (const [domain, type] of Object.entries(THIRD_PARTY_DOMAINS)) {
    if (url.includes(domain)) return type;
  }
  
  for (const pattern of FIRST_PARTY_PATTERNS) {
    if (pattern instanceof RegExp ? pattern.test(result.url) : result.url.includes(pattern)) {
      if (result.url.includes('careers')) return 'careers_page';
      if (result.url.includes('engineering') || result.url.includes('tech')) return 'engineering_blog';
      if (result.url.includes('blog')) return 'company_blog';
      return 'official_hiring_page';
    }
  }
  
  return 'unknown';
}

export function isFirstPartySource(result: SearchResult): boolean {
  const sourceType = classifySourceType(result);
  return [
    'official_hiring_page',
    'company_blog',
    'engineering_blog',
    'careers_page',
    'press_release',
  ].includes(sourceType);
}

export function calculateRelevance(result: SearchResult, options: ResearchOptions): number {
  let score = 1 - (result.position - 1) * 0.08;
  
  const text = `${result.title} ${result.snippet}`.toLowerCase();
  const companyName = options.companyName.toLowerCase();
  
  if (text.includes(companyName)) score += 0.2;
  
  const relevantTerms = ['interview', 'hiring', 'career', 'engineering', 'technical', 'coding', 'system design'];
  for (const term of relevantTerms) {
    if (text.includes(term)) score += 0.05;
  }
  
  return Math.min(1, Math.max(0, score));
}

export function extractInterviewAspects(result: SearchResult): InterviewAspect[] {
  const text = `${result.title} ${result.snippet}`.toLowerCase();
  const aspects: InterviewAspect[] = [];
  
  for (const [aspect, keywords] of Object.entries(ASPECT_KEYWORDS)) {
    let maxConfidence = 0;
    let bestMatch = '';
    
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        const confidence = 0.6 + (keyword.length / 100);
        if (confidence > maxConfidence) {
          maxConfidence = confidence;
          bestMatch = keyword;
        }
      }
    }
    
    if (maxConfidence > 0) {
      aspects.push({
        aspect: aspect as AspectType,
        confidence: Math.min(0.95, maxConfidence),
        supportingText: bestMatch,
      });
    }
  }
  
  return aspects;
}

export function extractClaims(result: SearchResult, isFirstParty: boolean): ExtractedClaim[] {
  const text = `${result.title} ${result.snippet}`;
  const claims: ExtractedClaim[] = [];
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  for (const sentence of sentences) {
    for (const [aspect, keywords] of Object.entries(ASPECT_KEYWORDS)) {
      for (const keyword of keywords) {
        if (sentence.toLowerCase().includes(keyword.toLowerCase())) {
          claims.push({
            claim: sentence.trim(),
            aspect: aspect as AspectType,
            sourceSentence: sentence.trim(),
            isFirstParty,
            confidence: isFirstParty ? 0.85 : 0.5,
          });
          break;
        }
      }
    }
  }
  
  return claims.slice(0, 5);
}

export function estimateDomainAuthority(url: string): number {
  try {
    const domain = new URL(url).hostname.toLowerCase();
    const highAuthority = ['google.com', 'github.com', 'linkedin.com', 'stackoverflow.com'];
    const mediumAuthority = ['glassdoor.com', 'indeed.com', 'levels.fyi', 'blindapp.com'];
    
    if (highAuthority.some(d => domain.includes(d))) return 90;
    if (mediumAuthority.some(d => domain.includes(d))) return 70;
    if (domain.includes('.gov') || domain.includes('.edu')) return 95;
    return 50;
  } catch {
    return 50;
  }
}

export function generateId(): string {
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function extractEvidence(result: SearchResult, options: ResearchOptions): ResearchEvidence | null {
  const sourceType = classifySourceType(result);
  const isFirstParty = isFirstPartySource(result);
  
  const evidence: ResearchEvidence = {
    id: generateId(),
    url: result.url,
    title: result.title,
    content: result.snippet,
    sourceType,
    sourceName: result.source.name,
    sourceUrl: result.url,
    retrievedAt: new Date(),
    relevanceScore: calculateRelevance(result, options),
    interviewAspects: extractInterviewAspects(result),
    claims: extractClaims(result, isFirstParty),
    credibility: CREDIBILITY_BY_SOURCE[sourceType] || 'unverified',
    metadata: {
      wordCount: result.snippet.split(/\s+/).length,
      language: 'en',
      searchRank: result.position,
      domainAuthority: estimateDomainAuthority(result.url),
    },
  };
  
  if (evidence.relevanceScore < 0.1) return null;
  
  return evidence;
}