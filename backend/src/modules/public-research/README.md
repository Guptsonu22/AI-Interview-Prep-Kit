# Public Interview Research Module

A module for discovering public interview experiences and hiring information about companies from approved search sources.

## Research Sources

### Supported Search Providers

| Provider | Type | Rate Limit | Credentials Required |
|----------|------|------------|---------------------|
| SerpAPI (Google) | Search API | 100 req/min | `SERPAPI_KEY` |
| Bing Search API | Search API | 1000 req/30s | `BING_API_KEY` |
| Google Custom Search | Search API | 100 req/day | `GOOGLE_API_KEY`, `GOOGLE_CSE_ID` |
| DuckDuckGo | HTML Scraping | 30 req/min | None |

### Source Categories

**First-Party (Official) Sources** - Credibility: `official`
- Company careers pages (`careers.company.com`, `jobs.company.com`)
- Engineering blogs (`engineering.company.com`, `tech.company.com`)
- Company blogs (`blog.company.com`)
- Press releases

**Third-Party (Candidate-Reported) Sources** - Credibility: `low` to `high`
- **High**: `levels.fyi` (structured, verified data)
- **Medium**: `glassdoor.com`, `indeed.com`, `hacker_news`, `stackoverflow`, `github_discussions`
- **Low**: `blind`, `reddit`, `quora`, `linkedin`, `youtube`, personal blogs

## Search Query Construction

Queries are built from:
1. **Company name** and **domain** (extracted from URL)
2. **Job description keywords** (tech stack, role requirements)
3. **Intent-specific terms** for 10 interview aspects:
   - `interview_process`, `technical_interview`, `coding_assessment`
   - `system_design`, `behavioral_interview`, `culture_interview`
   - `take_home_assignment`, `candidate_experience`
   - `hiring_rounds`, `interview_questions`
4. **Source modifiers**:
   - First-party: `site:careers.`, `site:jobs.`, `site:engineering.`, `inurl:careers`
   - Third-party: `site:glassdoor.com`, `site:levels.fyi`, `site:reddit.com`, etc.

### Example Queries
```
Acme Corp acme.com "interview process" site:careers.acme.com
Acme Corp acme.com "system design interview" site:levels.fyi
Acme Corp acme.com "coding challenge" site:glassdoor.com
```

## Deduplication & Relevance Ranking

### Deduplication
- By normalized URL + source name
- Keeps first occurrence (highest search rank)

### Relevance Scoring
```
baseScore = 1 - (position - 1) * 0.08
+0.2 if company name in title/snippet
+0.05 per relevant term (interview, hiring, engineering, technical, coding, system design)
-0.08 for candidate_experience intent
+0.05 for official sources
```

Results with `relevanceScore < 0.1` are discarded.

## Evidence Extraction

Each piece of evidence includes:
- **Source attribution**: URL, title, source name, type, retrieval timestamp
- **Content**: Full snippet from search result
- **Interview aspects**: Auto-detected from 15 aspect categories
- **Claims**: Extracted sentences with interview-relevant keywords
- **Credibility**: Mapped from source type
- **First-party flag**: Distinguishes official vs third-party

### Aspect Categories (15)
| Aspect | Keywords |
|--------|----------|
| `round_count` | round, stage, step, phase |
| `technical_depth` | algorithm, data structure, complexity, big o |
| `coding_focus` | code, coding, leetcode, hackerrank |
| `system_design` | architecture, scalability, distributed |
| `behavioral_focus` | behavioral, culture, values, leadership |
| `culture_fit` | culture fit, values, mission, work environment |
| `take_home` | take home, homework, assignment |
| `whiteboard` | whiteboard, diagram |
| `pair_programming` | pair program, pairing |
| `phone_screen` | phone screen, recruiter screen |
| `onsite_structure` | onsite, final round |
| `offer_timeline` | offer, timeline, feedback, decision |
| `difficulty_rating` | difficult, hard, easy, rating |
| `interviewer_types` | engineer, manager, director, peer |

## Source Budget & Throttling

```typescript
const options = {
  searchBudget: { requests: 20, windowMs: 60000 }, // 20 req/min
  maxSources: 50,
  maxResultsPerQuery: 5,
};
```

- Per-provider rate limits enforced
- Automatic provider selection (prefers available quota × priority)
- 1-2s random jitter between requests
- Respects `Retry-After` headers
- Falls back to next provider on rate limit

## First-Party vs Third-Party Separation

Results include counts:
- `firstPartyCount`: Official company sources
- `thirdPartyCount`: Candidate-reported sources

**Never treats anonymous claims as verified policy.** First-party sources are tagged `credibility: 'official'`. Third-party claims include `isFirstParty: false` and lower confidence scores.

## Structured Results

```typescript
interface ResearchResult {
  companyName: string;
  domain?: string;
  evidence: ResearchEvidence[];
  firstPartyCount: number;
  thirdPartyCount: number;
  searchQueriesUsed: SearchQuery[];
  totalSourcesSearched: number;
  budgetUsed: { requests: number; windowMs: number };
  status: 'complete' | 'partial' | 'no_results' | 'budget_exhausted' | 'provider_unavailable' | 'rate_limited' | 'error';
  statusMessage: string;
  retrievedAt: Date;
}
```

### Status Values
- `complete`: Found sufficient evidence
- `partial`: Found some evidence (< 3 sources)
- `no_results`: No relevant evidence found
- `budget_exhausted`: Hit request limit
- `provider_unavailable`: No API keys configured
- `rate_limited`: All providers rate limited
- `error`: Unexpected error

## Usage

```typescript
import { researchPublicInterviews } from './public-research';

const result = await researchPublicInterviews({
  companyName: 'Acme Corp',
  domain: 'https://acme.com',
  jobDescription: 'We use TypeScript, React, Node.js...',
  maxSources: 30,
  searchBudget: { requests: 30, windowMs: 60000 },
  minCredibility: 'medium',
  includeThirdParty: true,
  includeFirstParty: true,
});
```

## Limitations & Honest Reporting

1. **No search API configured**: Returns `provider_unavailable` status with clear message
2. **Rate limited**: Returns `rate_limited`, continues with other providers
3. **No results found**: Returns `no_results` with empty evidence list (not an error)
4. **Partial results**: Returns `partial` with whatever was found
5. **No fabricated data**: Only returns actually retrieved search results
6. **No credential bypass**: Never attempts login, CAPTCHA solving, or anti-bot evasion
7. **Respects robots.txt**: Inherits from company-site crawler when fetching pages

### Empty Results Are Not Failure
If no public discussions exist, the module honestly returns:
```json
{
  "status": "no_results",
  "statusMessage": "No relevant public interview evidence found",
  "evidence": [],
  "firstPartyCount": 0,
  "thirdPartyCount": 0
}
```

This is a valid outcome, not a failure.

## Required Credentials

| Provider | Env Var | Required |
|----------|---------|----------|
| SerpAPI | `SERPAPI_KEY` | No (optional) |
| Bing | `BING_API_KEY` | No (optional) |
| Google CSE | `GOOGLE_API_KEY`, `GOOGLE_CSE_ID` | No (optional) |
| DuckDuckGo | None | No (fallback) |

At least one provider should be configured for production use. Without any, the module returns `provider_unavailable`.

## Integration with Pipeline

The research result can be merged with company-site crawl data:

```typescript
import { mergeResearchResults } from './public-research';

const combinedEvidence = await mergeResearchResults(publicResearch, siteCrawlResult);
```

This provides both official documentation (from site crawl) and candidate-reported experiences (from public research) to the generation pipeline.