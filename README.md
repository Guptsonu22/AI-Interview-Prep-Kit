# AI Interview Prep Kit

A full-stack application that transforms a job description, company URL, and preparation timeline into a personalized, day-by-day interview preparation kit.

## Features

- **Secure Authentication** — JWT-based auth with per-user kit ownership
- **Company Intelligence** — Automated crawling and hiring-page discovery via ranked link analysis
- **Interview Research** — Public interview experience aggregation from Glassdoor, Reddit, and more
- **Deliberate LLM Pipeline** — Sequential, deterministic generation with temperature=0
- **Coverage Validation** — Zod schema validation with gap-filling pass
- **Appendix A Compliance** — Exact field names and types as specified
- **Content State Machine** — Generated → Edited → Pinned workflow
- **SRS Flashcards** — Confidence-based spaced repetition (SM-2 algorithm)
- **Deterministic Schedule** — Exact N-day study plan with hourly allocation
- **Batch Evaluation** — `npm run evaluate -- --input cases.json --output kits.json`

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS, TanStack Query
- **Backend**: Express.js, TypeScript, MongoDB (Mongoose)
- **Shared**: Zod schemas, pipeline orchestration, scheduler (npm workspace)
- **Auth**: bcryptjs, jsonwebtoken
- **Dev**: TypeScript, ESLint, Prettier, Vitest

## Project Structure

```
interview-prep-kit/
├── packages/
│   ├── shared/          # Types, schemas, pipeline, scheduler (used by both)
│   ├── api/             # Express API + MongoDB + CLI
│   └── web/             # Next.js frontend
├── package.json         # Root workspace config
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB 6+
- npm 10+

### Installation

```bash
# Install all dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your configuration
```

### Environment Variables

```env
# API
MONGODB_URI=mongodb://localhost:27017/interview-prep
JWT_SECRET=your-32-char-secret
JWT_EXPIRES_IN=7d
PORT=4000
NODE_ENV=development

# LLM (OpenAI-compatible)
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
LLM_TEMPERATURE=0

# Search API for research
SEARCH_API_KEY=
SEARCH_ENGINE=serpapi

# Web
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Development

```bash
# Start both API and web concurrently
npm run dev

# Or separately:
npm run dev --workspace=packages/api  # API on :4000
npm run dev --workspace=packages/web  # Web on :3000
```

### Building

```bash
npm run build
```

### Testing

```bash
npm run test
```

### Linting & Type Checking

```bash
npm run lint
npm run typecheck
```

## Batch Evaluation

Run the evaluation pipeline on a JSON file of test cases:

```bash
npm run evaluate -- --input cases.json --output kits.json
```

**Input format (cases.json):**
```json
[
  {
    "id": "case-1",
    "jobDescription": "...",
    "companyUrl": "https://company.com",
    "prepDays": 14
  }
]
```

**Output format (kits.json):**
```json
[
  {
    "caseId": "case-1",
    "kit": { ... },
    "metadata": {
      "generatedAt": "2024-01-15T10:30:00.000Z",
      "pipelineVersion": "1.0.0",
      "durationMs": 45000,
      "coverageScore": 0.92,
      "errors": []
    }
  }
]
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, returns session cookie |
| POST | `/api/auth/logout` | Revoke session & clear cookie |
| GET | `/api/auth/me` | Get current authenticated user |
| POST | `/api/kits` | Create new kit draft (validates JD, URL, days) |
| GET | `/api/kits` | List user's kits with pagination & filters |
| GET | `/api/kits/:id` | Get complete kit details (ownership enforced) |
| PATCH | `/api/kits/:id` | Update kit metadata with optimistic concurrency |
| DELETE | `/api/kits/:id` | Delete kit and cascade clean records |
| POST | `/api/kits/:id/generate` | Start generation job with idempotency protection |
| GET | `/api/kits/:id/progress` | Poll progress or stream Server-Sent Events (SSE) |
| POST | `/api/kits/:id/regenerate/company-brief` | Regenerate company brief |
| POST | `/api/kits/:id/regenerate/questions/:category` | Regenerate questions for a specific category |
| POST | `/api/kits/:id/regenerate/schedule` | Deterministically reallocate study schedule |
| PATCH | `/api/kits/:id/sections/:section` | Update section content (pinned & versioning enforced) |
| POST | `/api/kits/:id/sections/:section/pin` | Pin or unpin section to prevent overwrite |
| POST | `/api/kits/:id/questions` | Create custom interview question |
| PATCH | `/api/kits/:id/questions/:questionId` | Edit question content & difficulty |
| DELETE | `/api/kits/:id/questions/:questionId` | Delete question & remove from schedule |
| POST | `/api/kits/:id/questions/reorder` | Update question display order |
| PATCH | `/api/kits/:id/questions/:questionId/category` | Change a question's category |
| POST | `/api/kits/:id/flashcards` | Create study flashcard |
| PATCH | `/api/kits/:id/flashcards/:flashcardId` | Edit study flashcard |
| DELETE | `/api/kits/:id/flashcards/:flashcardId` | Delete study flashcard |
| GET | `/api/kits/:id/practice` | Get due cards and mastery statistics |
| POST | `/api/kits/:id/practice/records` | Submit SM-2 confidence rating (0–5) |

## Deployment

### Docker

```bash
# Build images
docker compose build

# Start services
docker compose up -d
```

### Environment

Set all required environment variables in production. Ensure:
- `JWT_SECRET` is a strong random string (32+ chars)
- `MONGODB_URI` points to a production MongoDB instance
- `LLM_API_KEY` is configured for your LLM provider
- `SEARCH_API_KEY` is configured for research

### Shared Orchestration Service (Web + CLI)

Both the web application (`POST /api/kits/:id/generate`) and the batch evaluation CLI (`npm run evaluate`) invoke the exact same sequential generation pipeline service (`packages/api/src/pipeline/orchestrator.ts`).

#### 17-Step Deliberate Orchestration Sequence

```
 1. validate-input               → Validates JD (min 100 chars), company URL, daysAvailable, userId
 2. normalize-input              → Strips tracking params, normalizes line breaks and whitespace
 3. extract-jd-metadata          → Extracts role metadata & requirements strictly from pasted JD (never from web)
 4. crawl-company-site           → Crawls target company domain within SSRF-safe constraints & crawl budget
 5. discover-hiring-pages        → Discovers and ranks relevant company, about, and hiring pages
 6. search-interview-evidence    → Searches company pages for public interview-process and evaluation evidence
 7. generate-company-brief       → Generates grounded company brief using evidence actually retrieved
 8. generate-questions           → Separate deliberate generation steps for:
      8a. technical questions
      8b. behavioural questions (STAR method)
      8c. system-design questions (scoped to seniority)
      8d. company-fit questions (grounded in brief)
 9. generate-flashcards          → Generates study flashcards linked to requirement IDs
10. compute-coverage-pass-1      → Deterministic application-logic coverage check (Pass 1)
11. identify-uncovered-musts     → Identifies all must-have requirements lacking question coverage
12. generate-gap-questions       → Generates targeted questions specifically for missing must-haves
13. recompute-coverage           → Re-evaluates coverage after gap questions
14. coverage-loop                → Repeats steps 11–13 until all must-haves covered or max passes reached
15. gap-analysis                 → If requirements remain uncovered after final pass, records explicit gap analysis
16. generate-schedule            → Generates deterministic day-by-day prep plan structured across daysAvailable
17. finalize-kit                 → Emits progress events; validates kit schema & reference integrity; saves complete kit
```

#### Maximum Coverage Passes & Mandatory Second Pass Loop

- **Deterministic Evaluation**: Coverage is computed purely through code logic (`coverage.ts`). An LLM never self-judges whether a requirement is covered; a requirement is covered if and only if at least one valid question explicitly references its ID in `requirement_ids`.
- **Mandatory Second Pass**: If any must-have requirement (`priority: "must"`) lacks question coverage after Pass 1, the pipeline automatically enters the gap-generation loop.
- **Configurable `maxCoveragePasses`**: Defaults to `3` (initial pass + up to 2 targeted gap passes).
- **Explicit Gap Analysis**: If any requirements remain uncovered when `maxCoveragePasses` is reached, an explicit gap analysis markdown section is written into `kit.coverage.gap_analysis`, listing each uncovered requirement ID, text, kind, and recommended evaluation path.
- **Atomicity**: The complete kit is persisted to the database only when the entire pipeline finishes successfully.

#### Deterministic Study Schedule (`allocateStudySchedule`)

Implemented entirely in application logic without any LLM calls:
- **Strict Day Count Guarantee**: Always produces exactly `days_available` sequential days (1 to $N$), handling timelines from 1 day up to 60 days.
- **Priority & Difficulty Ranking**: Schedules high-priority (`must`) and difficult (Difficulty 3) material early.
- **Full Coverage of Material**: Allocates every question in the question bank without dropping questions or referring to nonexistent question IDs.
- **Honest Sparse Handling**: For sparse kits or large timelines (e.g. 60 days), allocates active questions over initial days and designates explicit lightweight review days (`question_ids: []`, 30–45 mins) rather than fabricating fake questions.
- **Deterministic Positive Durations**: All durations are positive integer minutes calculated deterministically from difficulty ratings.

### Content State Machine

Each top-level kit field tracks its state:
- `generated` — Initially created by pipeline
- `edited` — User has modified the field
- `pinned` — User has locked the field (prevents overwrite on re-generation)

## License

MIT