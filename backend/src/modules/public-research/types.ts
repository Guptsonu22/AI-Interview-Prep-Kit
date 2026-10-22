export interface SearchQuery {
  query: string;
  companyName: string;
  domain?: string;
  terms: string[];
  intent: SearchIntent;
}

export type SearchIntent = 
  | 'interview_process'
  | 'technical_interview'
  | 'coding_assessment'
  | 'system_design'
  | 'behavioral_interview'
  | 'culture_interview'
  | 'take_home_assignment'
  | 'candidate_experience'
  | 'hiring_rounds'
  | 'interview_questions';

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  position: number;
  source: SearchSource;
  retrievedAt: Date;
}

export interface SearchSource {
  name: string;
  baseUrl: string;
  type: SourceType;
  requiresApiKey: boolean;
  rateLimit?: { requests: number; windowMs: number };
}

export type SourceType = 
  | 'search_api'
  | 'company_site'
  | 'review_site'
  | 'forum'
  | 'social_media'
  | 'document_sharing';

export interface ResearchEvidence {
  id: string;
  url: string;
  title: string;
  content: string;
  sourceType: EvidenceSourceType;
  sourceName: string;
  sourceUrl: string;
  retrievedAt: Date;
  relevanceScore: number;
  interviewAspects: InterviewAspect[];
  claims: ExtractedClaim[];
  credibility: CredibilityLevel;
  metadata: EvidenceMetadata;
}

export type EvidenceSourceType = 
  | 'official_hiring_page'
  | 'company_blog'
  | 'engineering_blog'
  | 'careers_page'
  | 'press_release'
  | 'glassdoor'
  | 'indeed'
  | 'levels_fyi'
  | 'blind'
  | 'reddit'
  | 'hacker_news'
  | 'linkedin'
  | 'quora'
  | 'stackoverflow'
  | 'github_discussions'
  | 'personal_blog'
  | 'youtube'
  | 'unknown';

export type CredibilityLevel = 
  | 'official'
  | 'high'
  | 'medium'
  | 'low'
  | 'unverified';

export interface InterviewAspect {
  aspect: AspectType;
  confidence: number;
  supportingText: string;
}

export type AspectType = 
  | 'round_count'
  | 'technical_depth'
  | 'coding_focus'
  | 'system_design'
  | 'behavioral_focus'
  | 'culture_fit'
  | 'take_home'
  | 'whiteboard'
  | 'pair_programming'
  | 'phone_screen'
  | 'onsite_structure'
  | 'offer_timeline'
  | 'difficulty_rating'
  | 'interviewer_types';

export interface ExtractedClaim {
  claim: string;
  aspect: AspectType;
  sourceSentence: string;
  isFirstParty: boolean;
  confidence: number;
}

export interface EvidenceMetadata {
  wordCount: number;
  language: string;
  publishDate?: Date;
  author?: string;
  domainAuthority?: number;
  searchRank?: number;
}

export interface ResearchOptions {
  companyName: string;
  domain?: string;
  jobDescription?: string;
  maxSources?: number;
  maxResultsPerQuery?: number;
  searchBudget?: { requests: number; windowMs: number };
  minCredibility?: CredibilityLevel;
  includeThirdParty?: boolean;
  includeFirstParty?: boolean;
  searchProviders?: SearchProvider[];
}

export type SearchProvider = 
  | 'serpapi'
  | 'bing'
  | 'google'
  | 'duckduckgo'
  | 'custom';

export interface ResearchResult {
  companyName: string;
  domain?: string;
  evidence: ResearchEvidence[];
  firstPartyCount: number;
  thirdPartyCount: number;
  searchQueriesUsed: SearchQuery[];
  totalSourcesSearched: number;
  budgetUsed: { requests: number; windowMs: number };
  status: ResearchStatus;
  statusMessage: string;
  retrievedAt: Date;
}

export type ResearchStatus = 
  | 'complete'
  | 'partial'
  | 'no_results'
  | 'budget_exhausted'
  | 'provider_unavailable'
  | 'rate_limited'
  | 'error';

export interface SearchProviderResponse {
  results: SearchResult[];
  totalResults: number;
  searchTimeMs: number;
  provider: SearchProvider;
  error?: string;
}

export interface RateLimitConfig {
  requests: number;
  windowMs: number;
  current: number;
  resetAt: number;
}