import { SearchProvider, SearchResult, SearchProviderResponse, ResearchOptions, SearchQuery, RateLimitConfig } from './types';

export class SearchProviderManager {
  private providers: Map<SearchProvider, SearchProviderAdapter> = new Map();
  private rateLimits: Map<SearchProvider, RateLimitConfig> = new Map();
  
  constructor(private options: ResearchOptions) {
    this.initializeProviders();
  }
  
  private initializeProviders(): void {
    const enabledProviders = this.options.searchProviders || ['serpapi', 'duckduckgo'];
    
    for (const provider of enabledProviders) {
      const adapter = this.createAdapter(provider);
      if (adapter) {
        this.providers.set(provider, adapter);
        this.rateLimits.set(provider, {
          requests: adapter.getRateLimit().requests,
          windowMs: adapter.getRateLimit().windowMs,
          current: 0,
          resetAt: Date.now() + adapter.getRateLimit().windowMs,
        });
      }
    }
  }
  
  private createAdapter(provider: SearchProvider): SearchProviderAdapter | null {
    switch (provider) {
      case 'serpapi':
        return new SerpApiAdapter();
      case 'duckduckgo':
        return new DuckDuckGoAdapter();
      case 'bing':
        return new BingAdapter();
      case 'google':
        return new GoogleAdapter();
      default:
        return null;
    }
  }
  
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const provider = this.selectProvider();
    if (!provider) {
      throw new Error('No search providers available');
    }
    
    if (!this.checkRateLimit(provider)) {
      throw new Error(`Rate limit exceeded for ${provider}`);
    }
    
    const adapter = this.providers.get(provider)!;
    const response = await adapter.search(query);
    
    this.incrementRateLimit(provider);
    
    if (response.error) {
      throw new Error(`${provider} error: ${response.error}`);
    }
    
    return response.results.map(r => ({ ...r, source: adapter.getSourceInfo() }));
  }
  
  private selectProvider(): SearchProvider | null {
    let bestProvider: SearchProvider | null = null;
    let bestScore = -1;
    
    for (const [provider, limit] of this.rateLimits) {
      if (!this.providers.has(provider)) continue;
      
      const available = limit.requests - limit.current;
      if (available <= 0) continue;
      
      const score = available * this.getProviderPriority(provider);
      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }
    
    return bestProvider;
  }
  
  private getProviderPriority(provider: SearchProvider): number {
    const priorities: Record<SearchProvider, number> = {
      serpapi: 10,
      google: 8,
      bing: 7,
      duckduckgo: 5,
      custom: 1,
    };
    return priorities[provider] || 1;
  }
  
  private checkRateLimit(provider: SearchProvider): boolean {
    const limit = this.rateLimits.get(provider);
    if (!limit) return true;
    
    if (Date.now() > limit.resetAt) {
      limit.current = 0;
      limit.resetAt = Date.now() + limit.windowMs;
    }
    
    return limit.current < limit.requests;
  }
  
  private incrementRateLimit(provider: SearchProvider): void {
    const limit = this.rateLimits.get(provider);
    if (limit) {
      limit.current++;
    }
  }
  
  getAvailableProviders(): SearchProvider[] {
    return Array.from(this.providers.keys());
  }
  
  getRateLimitStatus(): Map<SearchProvider, RateLimitConfig> {
    return new Map(this.rateLimits);
  }
}

abstract class SearchProviderAdapter {
  abstract search(query: SearchQuery): Promise<SearchProviderResponse>;
  abstract getSourceInfo(): { name: string; baseUrl: string; type: 'search_api' | 'review_site' | 'forum' | 'social_media'; requiresApiKey: boolean };
  abstract getRateLimit(): { requests: number; windowMs: number };
  
  protected buildUrl(baseUrl: string, params: Record<string, string>): string {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.append(key, value);
    }
    return url.toString();
  }
  
  protected getEnv(key: string): string | undefined {
    return process.env[key];
  }
}

class SerpApiAdapter extends SearchProviderAdapter {
  private apiKey: string | undefined;
  private baseUrl = 'https://serpapi.com/search';
  
  constructor() {
    super();
    this.apiKey = this.getEnv('SERPAPI_KEY');
  }
  
  async search(query: SearchQuery): Promise<SearchProviderResponse> {
    if (!this.apiKey) {
      return { results: [], totalResults: 0, searchTimeMs: 0, provider: 'serpapi', error: 'SERPAPI_KEY not configured' };
    }
    
    const params = {
      q: query.query,
      api_key: this.apiKey,
      engine: 'google',
      num: '10',
      hl: 'en',
      gl: 'us',
    };
    
    const url = this.buildUrl(this.baseUrl, params);
    const startTime = Date.now();
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      const searchTimeMs = Date.now() - startTime;
      
      if (data.error) {
        return { results: [], totalResults: 0, searchTimeMs, provider: 'serpapi', error: data.error };
      }
      
      const results: SearchResult[] = (data.organic_results || []).map((r: any, i: number) => ({
        url: r.link,
        title: r.title,
        snippet: r.snippet || '',
        position: i + 1,
        source: this.getSourceInfo(),
        retrievedAt: new Date(),
      }));
      
      return { results, totalResults: data.search_information?.total_results || 0, searchTimeMs, provider: 'serpapi' };
    } catch (error) {
      return { results: [], totalResults: 0, searchTimeMs: Date.now() - startTime, provider: 'serpapi', error: String(error) };
    }
  }
  
  getSourceInfo() {
    return { name: 'Google (SerpAPI)', baseUrl: 'https://google.com', type: 'search_api' as const, requiresApiKey: true };
  }
  
  getRateLimit() {
    return { requests: 100, windowMs: 60000 };
  }
}

class DuckDuckGoAdapter extends SearchProviderAdapter {
  private baseUrl = 'https://html.duckduckgo.com/html/';
  
  async search(query: SearchQuery): Promise<SearchProviderResponse> {
    const params = { q: query.query, kl: 'us-en' };
    const url = this.buildUrl(this.baseUrl, params);
    const startTime = Date.now();
    
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await response.text();
      const searchTimeMs = Date.now() - startTime;
      
      const results = this.parseResults(html, query);
      
      return { results, totalResults: results.length, searchTimeMs, provider: 'duckduckgo' };
    } catch (error) {
      return { results: [], totalResults: 0, searchTimeMs: Date.now() - startTime, provider: 'duckduckgo', error: String(error) };
    }
  }
  
  private parseResults(html: string, query: SearchQuery): SearchResult[] {
    const results: SearchResult[] = [];
    const urlRegex = /<a class="result__snippet" href="([^"]+)"/g;
    const titleRegex = /<a class="result__snippet"[^>]*>([^<]+)<\/a>/g;
    const snippetRegex = /<a class="result__snippet"[^>]*>[^<]*<\/a>([^<]*)/g;
    
    let match;
    let position = 1;
    while ((match = urlRegex.exec(html)) && results.length < 10) {
      const titleMatch = titleRegex.exec(html);
      const snippetMatch = snippetRegex.exec(html);
      const url = match[1] as string;
      const title = (titleMatch?.[1] ?? 'Search Result') as string;
      const snippet = (snippetMatch?.[1] ?? '') as string;
      results.push({
        url,
        title,
        snippet,
        position: position++,
        source: this.getSourceInfo(),
        retrievedAt: new Date(),
      });
    }
    
    return results;
  }
  
  getSourceInfo() {
    return { name: 'DuckDuckGo', baseUrl: 'https://duckduckgo.com', type: 'search_api' as const, requiresApiKey: false };
  }
  
  getRateLimit() {
    return { requests: 30, windowMs: 60000 };
  }
}

class BingAdapter extends SearchProviderAdapter {
  private apiKey: string | undefined;
  private baseUrl = 'https://api.bing.microsoft.com/v7.0/search';
  
  constructor() {
    super();
    this.apiKey = this.getEnv('BING_API_KEY');
  }
  
  async search(query: SearchQuery): Promise<SearchProviderResponse> {
    if (!this.apiKey) {
      return { results: [], totalResults: 0, searchTimeMs: 0, provider: 'bing', error: 'BING_API_KEY not configured' };
    }
    
    const params = { q: query.query, count: '10', mkt: 'en-US', safesearch: 'Moderate' };
    const url = this.buildUrl(this.baseUrl, params);
    const startTime = Date.now();
    
    try {
      const response = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': this.apiKey } });
      const data = await response.json();
      const searchTimeMs = Date.now() - startTime;
      
      const results: SearchResult[] = (data.webPages?.value || []).map((r: any, i: number) => ({
        url: r.url,
        title: r.name,
        snippet: r.snippet,
        position: i + 1,
        source: this.getSourceInfo(),
        retrievedAt: new Date(),
      }));
      
      return { results, totalResults: data.webPages?.totalEstimatedMatches || 0, searchTimeMs, provider: 'bing' };
    } catch (error) {
      return { results: [], totalResults: 0, searchTimeMs: Date.now() - startTime, provider: 'bing', error: String(error) };
    }
  }
  
  getSourceInfo() {
    return { name: 'Bing', baseUrl: 'https://bing.com', type: 'search_api' as const, requiresApiKey: true };
  }
  
  getRateLimit() {
    return { requests: 1000, windowMs: 30000 };
  }
}

class GoogleAdapter extends SearchProviderAdapter {
  private apiKey: string | undefined;
  private cx: string | undefined;
  private baseUrl = 'https://www.googleapis.com/customsearch/v1';
  
  constructor() {
    super();
    this.apiKey = this.getEnv('GOOGLE_API_KEY');
    this.cx = this.getEnv('GOOGLE_CSE_ID');
  }
  
  async search(query: SearchQuery): Promise<SearchProviderResponse> {
    if (!this.apiKey || !this.cx) {
      return { results: [], totalResults: 0, searchTimeMs: 0, provider: 'google', error: 'GOOGLE_API_KEY or GOOGLE_CSE_ID not configured' };
    }
    
    const params = { q: query.query, key: this.apiKey, cx: this.cx, num: '10' };
    const url = this.buildUrl(this.baseUrl, params);
    const startTime = Date.now();
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      const searchTimeMs = Date.now() - startTime;
      
      const results: SearchResult[] = (data.items || []).map((r: any, i: number) => ({
        url: r.link,
        title: r.title,
        snippet: r.snippet,
        position: i + 1,
        source: this.getSourceInfo(),
        retrievedAt: new Date(),
      }));
      
      return { results, totalResults: parseInt(data.searchInformation?.totalResults || '0', 10), searchTimeMs, provider: 'google' };
    } catch (error) {
      return { results: [], totalResults: 0, searchTimeMs: Date.now() - startTime, provider: 'google', error: String(error) };
    }
  }
  
  getSourceInfo() {
    return { name: 'Google Custom Search', baseUrl: 'https://google.com', type: 'search_api' as const, requiresApiKey: true };
  }
  
  getRateLimit() {
    return { requests: 100, windowMs: 86400000 };
  }
}