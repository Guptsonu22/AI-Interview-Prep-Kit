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

## Batch Evaluation (Prompt 10)

Run the batch evaluation entry point across multiple test cases using the mandatory exact command:

```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

### Input Format (`cases.json`)

An array of evaluation cases:
```json
[
  {
    "id": "case-01",
    "jd": "Senior Software Engineer responsible for building scalable cloud platforms in Node.js and TypeScript...",
    "company_url": "http://localhost:8099/acme/",
    "days": 5
  }
]
```

### Output Format (`kits.json`)

A single JSON object preserving one entry per input case in the exact same order:
```json
{
  "version": "1.0",
  "generated_at": "2026-10-21T14:30:00.000Z",
  "kits": [
    {
      "id": "case-01",
      "status": "ok",
      "kit": {
        "source": { "url": "http://localhost:8099/acme/", "title": "...", "job_description": "...", "retrieved_at": "..." },
        "company_brief": { "summary": "...", "what_they_do": "...", "sources": [...] },
        "role": { "title": "...", "seniority": "...", "responsibilities": [...], "requirements": [...] },
        "requirements": [...],
        "questions": [...],
        "flashcards": [...],
        "schedule": { "days_available": 5, "days": [...] },
        "coverage": { "uncovered_requirement_ids": [], "passes": 1 }
      },
      "error": null
    },
    {
      "id": "case-04",
      "status": "failed",
      "kit": null,
      "error": {
        "code": "COMPANY_UNREACHABLE",
        "message": "Company site unreachable at http://localhost:65530/unreachable: Connection failed"
      }
    }
  ]
}
```

### Batch Evaluation Rules & Invariants

1. **Shared Orchestration Service**: Invokes the exact same 17-step generation, deterministic coverage, scheduling, and validation pipeline as the web application without requiring MongoDB.
2. **Partial Evidence Acceptance**: Partially researched company sites (e.g. companies with no careers page or minimal public evidence) are marked as `status: "ok"` as long as a valid Appendix A kit is produced.
3. **Strict Failure Boundary**: Only marked as `status: "failed"` when no valid kit can be produced (e.g. unreachable company site `COMPANY_UNREACHABLE` or unrecoverable error).
4. **Localhost & SSRF Protection**: In production, private network and localhost crawling is strictly blocked. When running evaluations or test suites, localhost fixture servers (`http://localhost:...`) are supported via `ALLOW_LOCALHOST=true` or `--allow-localhost` without weakening production SSRF boundaries.
5. **URL Resolution**: Correctly resolves relative links (`<a href="about">`, `<a href="careers">`), including fixture sites with path prefixes (e.g. `/acme/`).
6. **Controlled Concurrency & Throttling**: Limits simultaneous cases via `p-limit` to prevent resource starvation, easily processing 5+ representative cases within 15 minutes.

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
| PATCH | `/api/kits/:id/company-brief` | Edit company brief fields (summary, what_they_do, sources) |
| PATCH | `/api/kits/:id/schedule/days/:day` | Edit specific schedule day fields (focus, minutes, questions) |
| PATCH | `/api/kits/:id/sections/:section` | Update section content (pinned & versioning enforced) |
| POST | `/api/kits/:id/sections/:section/pin` | Pin or unpin section to prevent overwrite |
| POST | `/api/kits/:id/questions` | Create custom interview question |
| PATCH | `/api/kits/:id/questions/:questionId` | Edit question content & difficulty |
| PATCH | `/api/kits/:id/questions/:questionId/pin` | Pin or unpin specific question |
| DELETE | `/api/kits/:id/questions/:questionId` | Delete question & remove from schedule |
| POST | `/api/kits/:id/questions/reorder` | Update question display order |
| PATCH | `/api/kits/:id/questions/:questionId/category` | Change a question's category |
| POST | `/api/kits/:id/flashcards` | Create study flashcard |
| PATCH | `/api/kits/:id/flashcards/:flashcardId` | Edit study flashcard |
| PATCH | `/api/kits/:id/flashcards/:flashcardId/pin` | Pin or unpin specific flashcard |
| DELETE | `/api/kits/:id/flashcards/:flashcardId` | Delete study flashcard |
| GET | `/api/kits/:id/practice` | Deterministic confidence-weighted review queue & deck coverage |
| POST | `/api/kits/:id/practice/records` | Submit SM-2 confidence rating (Again/Hard/Good/Easy) |
| GET | `/api/kits/:id/weak-spots` | Ranked topic risk analysis & targeted practice recommendations |

## Practice Mode & Deterministic Confidence-Weighted Queue

The practice mode implements active recall with a **deterministic confidence-weighted review queue**:

### Queue Ordering Algorithm

When a candidate requests flashcards for practice via `GET /api/kits/:id/practice`, active cards from `kit.kitData.flashcards` are sorted using the following strict multi-tier rule:

1. **Primary Priority Bucket (Unreviewed & Low-Confidence First)**:
   - **Bucket 0 — Unreviewed**: Flashcards never before reviewed by this user in this kit receive top priority to guarantee comprehensive exposure across all posting criteria.
   - **Bucket 1 — Again / Blackout (Confidence 0)**: Immediate restart required.
   - **Bucket 2 — Again / Wrong (Confidence 1)**: Incorrect recall.
   - **Bucket 3 — Hard (Confidence 2)**: Recalled with significant struggle.
   - **Bucket 4 — Good (Confidence 3)**: Acceptable recall.
   - **Bucket 5 — Easy (Confidence 4)**: Good recall with slight hesitation.
   - **Bucket 6 — Perfect (Confidence 5)**: Flawless instant recall.
2. **Secondary Tie-Breaker (Least Recently Reviewed)**:
   - For reviewed cards in the same confidence bucket, the card with the oldest `reviewedAt` timestamp is placed earlier in the queue.
3. **Tertiary Tie-Breaker (Deterministic Stability)**:
   - If two cards have identical priority and timestamps (or are both unreviewed), ties are broken deterministically by alphabetical order of the card ID (`a.id.localeCompare(b.id)`). This guarantees identical, reproducible review queues across server restarts and client page reloads.

### Spaced Repetition Scheduling (SuperMemo SM-2)

Each rating submitted to `POST /api/kits/:id/practice/records` updates the user's persistent review record:
- **Interval calculation**:
  - Rating $\ge 3$ (Good/Easy): First repetition = 1 hour, second repetition = 6 hours, subsequent repetitions = $\text{round}(\text{interval} \times \text{easeFactor})$.
  - Rating $< 3$ (Again/Hard): Resets interval to 1 hour and resets repetitions to 0.
- **Ease factor adaptation**:
  - $\text{easeFactor}' = \max(1.3, \text{easeFactor} + (0.1 - (5 - \text{confidence}) \times (0.08 + (5 - \text{confidence}) \times 0.02)))$.
- **Resume State**: Progress and deck coverage percentages are tracked per user and kit. Leaving and re-entering resumes cleanly through the unreviewed cards. Deleted flashcards are immediately pruned from the active queue.

## Weak Spots & Topic Risk Analysis

The **Weak Spots** subsystem (`GET /api/kits/:id/weak-spots`) analyzes the intersection between job posting requirements and candidate preparation history:

1. **Coverage & Struggle Correlation**:
   - For every extracted requirement in the kit, the engine tracks all mapped questions and flashcards.
   - It computes the average self-assessed confidence, total reviews, and the frequency of low-confidence ratings ($< 3$).
2. **Priority Weighting**:
   - **Must-Have** requirements receive higher severity weight ($2.5\times$) compared to **Nice-to-Have** requirements ($1.0\times$).
   - Completely unpracticed must-haves are flagged as `critical` urgency.
3. **Deterministic Risk Ranking**:
   - Topics are ranked by urgency score (combining posting priority, recall deficit, and review attempts), breaking ties by stable requirement ID.
4. **Targeted Practice Recommendations**:
   - Returns a curated subset of flashcard IDs focused specifically on the candidate's top identified gaps for rapid pre-interview reinforcement.
5. **Transparency & Grounding**:
   - The engine explicitly disclaims that self-reported confidence reflects personal familiarity rather than an external objective assessment of interview performance.

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

### State-Preservation Model & Modification Semantics (Prompt 9)

The kit builder implements an explicit state-preservation model that ensures user work is never lost across full-kit generation, targeted category regeneration, reordering, or concurrent sessions.

#### 1. Entity Provenance & Modification States

Every editable entity (Questions, Flashcards, Sections) carries explicit provenance and state flags:

- **`provenance` (`'generated' | 'user_created'`)**:
  - `'generated'`: Created autonomously by the LLM pipeline or category generator.
  - `'user_created'`: Authored manually by the user via the API or UI.
- **`edited` (`boolean`)**:
  - Automatically flipped to `true` whenever any field (prompt, answer outline, front, back, difficulty, category) is updated by the user.
- **`pinned` (`boolean`)**:
  - Explicitly toggled by the user via `/pin` endpoints or section toggles.
  - Prevents regeneration from replacing or modifying the item, even when an entire section is regenerated.

#### 2. Preservation Guarantees

Across all partial and full regeneration operations:
- **Stable IDs**: Retained questions, flashcards, requirements, and days maintain immutable, stable IDs.
- **Requirement References**: Maintained across edits. If requirements are deleted, `sanitizeRequirementReferences` safely prunes dead references and maps orphaned items to valid remaining requirements to guarantee reference integrity (`validateKitReferences`).
- **Category & Display Order**: User custom ordering in `sections.questions.order` is strictly preserved. In partial regenerations, retained questions preserve their relative ordering, and newly created draft questions are appended to the sequence.
- **Schedule Consistency**: When questions are deleted, they are automatically removed from all scheduled days. When categories are regenerated, schedule references are re-synchronized using deterministic allocation (`allocateStudySchedule`), unless the schedule itself is marked `pinned`.

#### 3. Category Regeneration Merge Invariants

When a user regenerates category $C$ (`POST /api/kits/:id/regenerate/questions/:category`):
1. **Unrelated Categories Preserved**: All questions in categories other than $C$ are preserved unchanged.
2. **Protected Questions in Target Category**: Any question in category $C$ that meets any of the following criteria is preserved:
   - `provenance === 'user_created'` (manually authored)
   - `edited === true` (user has modified the prompt, outline, or difficulty)
   - `pinned === true` (explicitly locked)
3. **Replacement Draft**: A fresh draft is generated for category $C$.
4. **Deduplication**: Draft questions with prompts matching existing protected questions are filtered out to avoid duplicates.
5. **Atomic Merge**: The merged question set $\text{Questions}_{c \neq C} \cup \text{Protected}_{c = C} \cup \text{UniqueDraft}$ is applied atomically.

#### 4. Optimistic Concurrency Control (OCC)

To prevent concurrent browser tabs or multiple users from silently clobbering edits:
- Every kit has a monotonic `version` counter incremented on every DB save.
- All mutating endpoints (`PATCH /api/kits/:id`, `PATCH /api/kits/:id/questions/:questionId`, `POST /api/kits/:id/regenerate/*`, `POST /api/kits/:id/questions/reorder`, etc.) accept a `version` parameter in the request payload.
- If the client's provided `version` does not match the current DB version, the update is rejected with `409 Conflict` (`Conflict: Stale kit version. Provided X, current is Y`).
- The client UI uses optimistic local state updates with automatic rollback or conflict notification when a `409` is received.

## License

MIT