import { ResearchOptions, ResearchResult, ResearchEvidence, SearchQuery, ResearchStatus, SearchResult } from './types';
import { buildSearchQueries, prioritizeQueries } from './query-builder';
import { SearchProviderManager } from './search-providers.js';
import { extractEvidence, generateId, isFirstPartySource as isFirstPartyEvidence, classifySourceType } from './evidence-extractor';
import pino from 'pino';

const logger = pino({ name: 'public-research' });

export async function researchPublicInterviews(options: ResearchOptions): Promise<ResearchResult> {
  const startTime = Date.now();
  const {
    companyName,
    domain,
    maxSources = 50,
    maxResultsPerQuery = 5,
    searchBudget = { requests: 20, windowMs: 60000 },
    minCredibility = 'low',
    includeThirdParty = true,
    includeFirstParty = true,
  } = options;
  
  const queries = prioritizeQueries(
    buildSearchQueries({ companyName, domain, includeFirstParty, includeThirdParty }),
    options
  );
  
  const providerManager = new (await import('./search-providers.js')).SearchProviderManager(options);
  const evidence: ResearchEvidence[] = [];
  const searchedSources = new Set<string>();
  let totalRequests = 0;
  let status: ResearchStatus = 'complete';
  let statusMessage = 'Research completed successfully';
  
  for (const query of queries) {
    if (totalRequests >= searchBudget.requests) {
      status = 'budget_exhausted';
      statusMessage = `Search budget exhausted (${searchBudget.requests} requests)`;
      break;
    }
    
    if (evidence.length >= maxSources) break;
    
    try {
      logger.info({ query: query.query, intent: query.intent }, 'Executing search');
      
      const results = await providerManager.search(query);
      totalRequests++;
      
      for (const result of results.slice(0, maxResultsPerQuery)) {
        if (evidence.length >= maxSources) break;
        
        const sourceKey = `${result.url}_${result.source.name}`;
        if (searchedSources.has(sourceKey)) continue;
        searchedSources.add(sourceKey);
        
        const extracted = extractEvidence(result, options);
        if (!extracted) continue;
        
        if (!meetsCredibilityThreshold(extracted, minCredibility)) continue;
        
        evidence.push(extracted);
      }
      
      await throttleRequest();
      
    } catch (error) {
      logger.warn({ query: query.query, error: String(error) }, 'Search failed');
      
      if (String(error).includes('Rate limit') || String(error).includes('rate limit')) {
        status = 'rate_limited';
        statusMessage = 'Rate limited by search provider';
        break;
      }
      
      if (String(error).includes('not configured') || String(error).includes('unavailable')) {
        status = 'provider_unavailable';
        statusMessage = `Search provider unavailable: ${String(error)}`;
      }
    }
  }
  
  if (evidence.length === 0) {
    status = 'no_results';
    statusMessage = 'No relevant public interview evidence found';
  } else if (status === 'complete' && evidence.length < 3) {
    status = 'partial';
    statusMessage = `Limited evidence found (${evidence.length} sources)`;
  }
  
  const firstPartyCount = evidence.filter(e => ['official_hiring_page', 'company_blog', 'engineering_blog', 'careers_page', 'press_release'].includes(e.sourceType)).length;
  const thirdPartyCount = evidence.length - firstPartyCount;
  
  return {
    companyName,
    domain,
    evidence,
    firstPartyCount,
    thirdPartyCount,
    searchQueriesUsed: queries,
    totalSourcesSearched: searchedSources.size,
    budgetUsed: { requests: totalRequests, windowMs: searchBudget.windowMs },
    status,
    statusMessage,
    retrievedAt: new Date(),
  };
}

function meetsCredibilityThreshold(evidence: ResearchEvidence, threshold: 'official' | 'high' | 'medium' | 'low' | 'unverified'): boolean {
  const levels = ['unverified', 'low', 'medium', 'high', 'official'];
  return levels.indexOf(evidence.credibility) >= levels.indexOf(threshold);
}

function isFirstPartySource(evidence: ResearchEvidence): boolean {
  return ['official_hiring_page', 'company_blog', 'engineering_blog', 'careers_page', 'press_release'].includes(evidence.sourceType);
}

async function throttleRequest(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
}

export async function mergeResearchResults(
  companyResearch: ResearchResult,
  siteResearch: { pages: any[] }
): Promise<ResearchEvidence[]> {
  const allEvidence = [...companyResearch.evidence];
  
  for (const page of siteResearch.pages) {
    if (page.content && page.content.length > 100) {
      allEvidence.push({
        id: `site_${generateId()}`,
        url: page.url,
        title: page.title || 'Company Page',
        content: page.content.slice(0, 5000),
        sourceType: 'official_hiring_page',
        sourceName: companyResearch.companyName,
        sourceUrl: page.url,
        retrievedAt: new Date(),
        relevanceScore: 0.9,
        interviewAspects: [],
        claims: [],
        credibility: 'official',
        metadata: { wordCount: page.content.length, language: 'en' },
      });
    }
  }
  
  return allEvidence;
}

export { buildSearchQueries, prioritizeQueries } from './query-builder';
export { SearchProviderManager } from './search-providers';
export { extractEvidence } from './evidence-extractor';