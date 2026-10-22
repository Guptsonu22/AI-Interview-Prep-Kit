import { SearchQuery, SearchIntent, ResearchOptions } from './types';

const INTENT_TERMS: Record<SearchIntent, string[]> = {
  interview_process: [
    'interview process',
    'hiring process',
    'recruitment process',
    'interview rounds',
    'interview stages',
  ],
  technical_interview: [
    'technical interview',
    'coding interview',
    'programming interview',
    'technical assessment',
    'algorithms interview',
  ],
  coding_assessment: [
    'coding challenge',
    'take home assignment',
    'coding test',
    'programming challenge',
    'leetcode style',
    'hackerrank',
    'codility',
  ],
  system_design: [
    'system design interview',
    'architecture interview',
    'scalability interview',
    'design interview',
    'system design questions',
  ],
  behavioral_interview: [
    'behavioral interview',
    'culture interview',
    'values interview',
    'soft skills interview',
    'leadership principles',
  ],
  culture_interview: [
    'culture fit interview',
    'company culture',
    'team culture',
    'values interview',
    'work environment',
  ],
  take_home_assignment: [
    'take home',
    'take-home',
    'homework assignment',
    'coding project',
    'portfolio project',
  ],
  candidate_experience: [
    'interview experience',
    'candidate experience',
    'interview review',
    'interview feedback',
    'got rejected',
    'got offer',
  ],
  hiring_rounds: [
    'how many rounds',
    'interview rounds',
    'number of interviews',
    'phone screen',
    'onsite interview',
  ],
  interview_questions: [
    'interview questions',
    'asked questions',
    'what they asked',
    'interview topics',
    'technical questions',
  ],
};

const SOURCE_MODIFIERS = {
  official: [
    'site:careers.',
    'site:jobs.',
    'site:engineering.',
    'site:blog.',
    'inurl:careers',
    'inurl:jobs',
    'inurl:engineering',
  ],
  thirdParty: [
    'site:glassdoor.com',
    'site:indeed.com',
    'site:levels.fyi',
    'site:blindapp.com',
    'site:reddit.com/r/',
    'site:news.ycombinator.com',
    'site:linkedin.com',
    'site:quora.com',
  ],
};

export function buildSearchQueries(options: ResearchOptions): SearchQuery[] {
  const { companyName, domain, jobDescription, includeFirstParty = true, includeThirdParty = true } = options;
  const queries: SearchQuery[] = [];
  
  const baseTerms = extractBaseTerms(companyName, domain, jobDescription);
  
  for (const intent of Object.keys(INTENT_TERMS) as SearchIntent[]) {
    const intentTerms = INTENT_TERMS[intent];
    
    if (includeFirstParty) {
      for (const modifier of SOURCE_MODIFIERS.official) {
        queries.push(buildQuery(companyName, domain, baseTerms, intentTerms, intent, modifier, 'official'));
      }
    }
    
    if (includeThirdParty) {
      for (const modifier of SOURCE_MODIFIERS.thirdParty) {
        queries.push(buildQuery(companyName, domain, baseTerms, intentTerms, intent, modifier, 'third_party'));
      }
    }
    
    queries.push(buildQuery(companyName, domain, baseTerms, intentTerms, intent, '', 'general'));
  }
  
  return deduplicateQueries(queries);
}

function extractBaseTerms(companyName: string, domain?: string, jobDescription?: string): string[] {
  const terms = [companyName];
  
  if (domain) {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] as string;
    terms.push(cleanDomain);
    const domainParts = cleanDomain.split('.');
    if (domainParts.length > 1 && domainParts[0]) {
      terms.push(domainParts[0]);
    }
  }
  
  if (jobDescription) {
    const techKeywords = extractTechKeywords(jobDescription);
    terms.push(...techKeywords.slice(0, 5));
  }
  
  return [...new Set(terms)];
}

function extractTechKeywords(text: string): string[] {
  const techPatterns = [
    /\b(JavaScript|TypeScript|Python|Java|Go|Rust|C\+\+|C#|Ruby|PHP|Swift|Kotlin)\b/gi,
    /\b(React|Vue|Angular|Node\.js|Express|Django|Spring|Rails|Laravel)\b/gi,
    /\b(AWS|GCP|Azure|Docker|Kubernetes|PostgreSQL|MongoDB|Redis|GraphQL|REST)\b/gi,
    /\b(Microservices|Distributed Systems|System Design|Architecture|Scalability)\b/gi,
  ];
  
  const found = new Set<string>();
  for (const pattern of techPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(m => found.add(m.toLowerCase()));
    }
  }
  
  return Array.from(found).slice(0, 10);
}

function buildQuery(
  companyName: string,
  domain: string | undefined,
  baseTerms: string[],
  intentTerms: string[],
  intent: SearchIntent,
  modifier: string,
  sourceType: 'official' | 'third_party' | 'general'
): SearchQuery {
  const queryParts = [companyName];
  
  const cleanDomain = domain?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (cleanDomain) {
    queryParts.push(cleanDomain);
  }
  
  queryParts.push(...baseTerms.slice(0, 3));
  queryParts.push(...intentTerms.slice(0, 2));
  
  if (modifier) {
    queryParts.push(modifier);
  }
  
  return {
    query: queryParts.join(' '),
    companyName,
    domain: cleanDomain,
    terms: [...baseTerms, ...intentTerms],
    intent,
  };
}

function deduplicateQueries(queries: SearchQuery[]): SearchQuery[] {
  const seen = new Set<string>();
  return queries.filter(q => {
    const key = q.query.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function prioritizeQueries(queries: SearchQuery[], options: ResearchOptions): SearchQuery[] {
  return queries.sort((a, b) => {
    let scoreA = 0, scoreB = 0;
    
    if (a.intent === 'interview_process' || a.intent === 'technical_interview') scoreA += 10;
    if (b.intent === 'interview_process' || b.intent === 'technical_interview') scoreB += 10;
    
    // Prioritize queries with official source modifiers
    if (a.query.includes('site:careers.') || a.query.includes('site:jobs.') || a.query.includes('inurl:careers')) scoreA += 5;
    if (b.query.includes('site:careers.') || b.query.includes('site:jobs.') || b.query.includes('inurl:careers')) scoreB += 5;
    
    if (a.intent === 'candidate_experience') scoreA -= 2;
    if (b.intent === 'candidate_experience') scoreB -= 2;
    
    return scoreB - scoreA;
  });
}