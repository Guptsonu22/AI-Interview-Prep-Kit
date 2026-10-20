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
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/kits` | Create new kit |
| GET | `/api/kits` | List user's kits |
| GET | `/api/kits/:id` | Get kit details |
| PATCH | `/api/kits/:id` | Update kit content/state |
| POST | `/api/kits/:id/generate` | Trigger generation pipeline |
| GET | `/api/kits/:id/status` | Check pipeline status |
| POST | `/api/flashcards/review` | Submit confidence rating |
| GET | `/api/flashcards/kit/:kitId/due` | Get due flashcards |
| GET | `/api/schedule/:kitId` | Get study schedule |

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

## Architecture

### Shared Pipeline (Web + CLI)

Both the web application and the batch CLI command use the exact same pipeline from `@interview-prep/shared`:

```
Pipeline Steps:
1. extract-requirements   → Structured requirements from job description
2. crawl-company          → Company profile, hiring pages, tech stack
3. research-interviews    → Public interview experiences
4. synthesize-kit         → Draft kit (Appendix A schema)
5. validate-coverage      → Zod validation + coverage check
6. gap-fill               → LLM fills missing required fields
7. generate-schedule      → Deterministic N-day schedule
8. generate-flashcards    → SRS-initialized flashcard deck
```

### Content State Machine

Each top-level kit field tracks its state:
- `generated` — Initially created by pipeline
- `edited` — User has modified the field
- `pinned` — User has locked the field (prevents overwrite on re-generation)

## License

MIT