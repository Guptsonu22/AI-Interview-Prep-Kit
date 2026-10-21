# AI Interview Prep Kit

A production-grade, full-stack application that transforms any job description, company URL, and candidate timeline into a personalized, day-by-day interview preparation kit with active recall practice and automated topic gap analysis.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Choices & Justifications](#2-technology-choices--justifications)
3. [Architecture & Data Flow](#3-architecture--data-flow)
4. [Folder Structure](#4-folder-structure)
5. [Local Setup](#5-local-setup)
6. [Exact Development Commands](#6-exact-development-commands)
7. [Production Deployment Instructions](#7-production-deployment-instructions)
8. [Environment Variable Reference](#8-environment-variable-reference)
9. [Selected LLM Provider & Model](#9-selected-llm-provider--model)
10. [Retrieval Strategy & Sources Used](#10-retrieval-strategy--sources-used)
11. [Crawling Safety & Rate Limits](#11-crawling-safety--rate-limits)
12. [Generation Sequence & Coverage Second Pass](#12-generation-sequence--coverage-second-pass)
13. [Appendix A Schema Validation](#13-appendix-a-schema-validation)
14. [Batch Input & Output Examples](#14-batch-input--output-examples)
15. [The Exact Evaluate Command](#15-the-exact-evaluate-command)
16. [State Preservation & Regeneration Semantics](#16-state-preservation--regeneration-semantics)
17. [Schedule Allocation Algorithm](#17-schedule-allocation-algorithm)
18. [Practice Mode & Weak Spots](#18-practice-mode--weak-spots)
19. [Automated Tests & Verification Commands](#19-automated-tests--verification-commands)
20. [Known Limitations & Trade-offs](#20-known-limitations--trade-offs)

---

## 1. Project Overview

The **AI Interview Prep Kit** bridges the gap between static job postings and structured interview readiness. Rather than generating a single unstructured wall of text, the system uses a **17-step deliberate orchestration pipeline** that:
- Deconstructs job postings into grounded `must-have` and `nice-to-have` requirements.
- Publicly researches the hiring company while strictly preventing SSRF and respecting crawler rate limits.
- Generates structured technical, behavioral, system design, and company-fit interview questions alongside active recall flashcards.
- Computes requirement coverage deterministically in application code, triggering automatic gap-filling passes if any must-have requirement lacks question coverage.
- Bin-packs questions into an exact $N$-day study plan prioritizing high-difficulty, must-have material early.
- Preserves candidate edits, hand-crafted questions, and pinned content across partial regenerations through an optimistic concurrency control (OCC) state model.
- Provides a distraction-free flashcard practice mode with a deterministic confidence-weighted review queue and an automated **Weak Spots** risk analyzer.

---

## 2. Technology Choices & Justifications

| Technology | Role | Justification |
| :--- | :--- | :--- |
| **Next.js 14 (App Router)** | Web Frontend | Server-Side Rendering (SSR) for initial loads, React Server Components for fast data fetching, and Next.js Route Handlers for decoupled deployment. |
| **Express.js (Node 20+)** | Backend API | Lightweight, mature, enterprise HTTP layer with robust middleware chaining for authentication, CORS, rate-limiting, and error handling. |
| **TypeScript 5.x** | Language | End-to-end static typing across web, API, and shared modules via npm workspaces, eliminating schema drift between layers. |
| **Zod 3.x** | Schema & Runtime Validation | Strict contract validation for Appendix A kits, Appendix B batch outputs, API payloads, and LLM structured outputs. |
| **MongoDB & Mongoose 8** | Persistence | Flexible document storage matching the rich, nested hierarchy of Appendix A interview kits; indexed user sessions and per-user kit isolation. |
| **Tailwind CSS** | Design & UI | Utility-first styling providing a responsive dark-slate SaaS interface, smooth micro-interactions, accessible modal dialogs, and clear state badges. |
| **TanStack Query v5** | State Management | Resilient asynchronous state caching, optimistic UI updates, background polling, and automated cache invalidation. |
| **Pino** | Production Logging | High-performance, JSON-formatted structured logging with redaction for credentials, cookies, and sensitive candidate data. |
| **SuperMemo SM-2** | Active Recall Algorithm | Battle-tested spaced repetition formula calculating intervals and ease factors from candidate confidence ratings (Again, Hard, Good, Easy). |

---

## 3. Architecture & Data Flow

```
                      +---------------------------------------+
                      |         Next.js 14 Frontend           |
                      |  (Dashboard, Kit Builder, Practice)   |
                      +-------------------+-------------------+
                                          |
                                HTTP / SSE (Cookies)
                                          |
                      +-------------------v-------------------+
                      |          Express 4.x API              |
                      |  - Auth & Ownership Middleware        |
                      |  - REST & Regeneration Controllers    |
                      +---------+-------------------+---------+
                                |                   |
             +------------------+                   +------------------+
             |                                                         |
+------------v------------+                               +------------v------------+
|   MongoDB Atlas / Local |                               |    Shared Orchestrator  |
| - Users & Token Hashes  |                               | - 17-Step Pipeline      |
| - Kits & Versioning     |                               | - Crawler & SSRF Guard  |
| - Practice Records      |                               | - LLM Multi-Pass Engine |
+-------------------------+                               | - Deterministic Planner |
                                                          +------------+------------+
                                                                       |
                                                          +------------v------------+
                                                          |  CLI Batch Evaluator    |
                                                          |  (npm run evaluate)     |
                                                          +-------------------------+
```

### High-Level Data Flow:
1. **Intake**: Candidate submits raw Job Description, Company URL, and target preparation timeline ($N$ days).
2. **Analysis & Grounding**: Role metadata and discrete requirements are extracted strictly from the JD with prompt injection delimiters (`<<<DATA:JOB_DESCRIPTION>>>`).
3. **Public Research**: Company pages are safely crawled within an SSRF-hardened boundary; hiring guidelines and culture are ranked and synthesized into a company brief.
4. **Targeted Generation**: Questions (Technical, Behavioral, System Design, Company Fit) and Flashcards are generated in isolated LLM calls (`temperature = 0`).
5. **Deterministic Verification**: Application code verifies that 100% of must-have requirements have mapped questions. Missing items trigger a targeted gap-filling second pass.
6. **Bin-Packing Scheduling**: Code packs questions across the exact day count, scheduling difficult and core material early.
7. **Interactive Workspace**: Candidate edits, pins, reorders, practices flashcards, and reviews weak spots.

---

## 4. Folder Structure

```
AI-Interview-Prep-Kit/
├── packages/
│   ├── shared/                   # Shared npm workspace package
│   │   ├── src/
│   │   │   ├── pipeline/         # Deterministic coverage calculation & deduplication
│   │   │   ├── scheduler/        # Deterministic study schedule bin-packer
│   │   │   ├── schema/           # Zod schemas for Appendix A Kit & Appendix B Batch
│   │   │   ├── validator/        # Cross-reference integrity validator
│   │   │   └── __tests__/        # Schema & scheduler unit test suites
│   ├── api/                      # Express backend API & CLI service
│   │   ├── src/
│   │   │   ├── cli/              # evaluate.ts & batch runner
│   │   │   ├── config/           # Environment configuration & validation
│   │   │   ├── db/               # Mongoose models (User, Kit, PracticeRecord, Session)
│   │   │   ├── llm/              # Gemini / OpenAI clients, retry wrappers, Zod normalization
│   │   │   ├── middleware/       # Auth session guard, CSRF, ownership, error handler
│   │   │   ├── modules/          # Auth, Kits, Research crawler, Flashcards, Schedule
│   │   │   ├── pipeline/         # 17-step Pipeline Orchestrator & Idempotency manager
│   │   │   ├── services/         # Practice SRS queue & Weak Spots analyzer
│   │   │   └── __tests__/        # API, auth, crawler, LLM, pipeline, state preservation tests
│   └── web/                      # Next.js 14 App Router frontend
│       ├── src/
│       │   ├── app/              # Next.js pages: /auth, /dashboard, /kits/[id], /practice
│       │   ├── components/       # Kit builder components (QuestionCard, ScheduleEditor, etc.)
│       │   ├── lib/              # API client, auth context, query hooks
│       │   └── __tests__/        # React Testing Library component tests
├── cases.example.json            # Sample batch evaluation input file
├── package.json                  # Root monorepo workspace configuration
├── .env.example                  # Documented environment template
└── README.md                     # Complete project documentation
```

---

## 5. Local Setup

### Prerequisites
- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **MongoDB**: v6.x or higher (local daemon or free MongoDB Atlas cluster)

### Step-by-Step Installation

```bash
# 1. Clone repository
git clone https://github.com/Guptsonu22/AI-Interview-Prep-Kit.git
cd AI-Interview-Prep-Kit

# 2. Install dependencies across all workspace packages
npm install

# 3. Configure environment variables
cp .env.example .env
```

Open `.env` and configure your settings:
```env
# Point to your local or Atlas MongoDB
MONGODB_URI=mongodb://localhost:27017/interview-prep

# Provide credentials for Gemini (free-tier default) or OpenAI
LLM_PROVIDER=gemini
LLM_API_KEY=your_gemini_api_key_here
LLM_MODEL=gemini-1.5-flash
```

---

## 6. Exact Development Commands

```bash
# Start both backend API (:4000) and frontend (:3000) concurrently
npm run dev

# Start packages individually
npm run dev --workspace=packages/api
npm run dev --workspace=packages/web

# Execute full monorepo test suite (Vitest)
npm test

# Run TypeScript type check across all workspaces
npm run typecheck

# Run ESLint validation across all workspaces
npm run lint

# Compile production bundles
npm run build
```

---

## 7. Production Deployment Instructions

### A. Next.js Frontend (Vercel, AWS Amplify, or Node Standalone)
1. Set the root directory to `packages/web` or deploy the monorepo root with output configuration.
2. Ensure environment variables are populated in the deployment console:
   - `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`
   - `NEXT_PUBLIC_APP_URL=https://yourdomain.com`
3. If containerizing via Docker, set `NEXT_OUTPUT_STANDALONE=true` during `npm run build` to generate an optimized standalone build in `packages/web/.next/standalone`.

### B. Express Backend (Render, Railway, Fly.io, or AWS ECS)
1. Ensure the Node host runs Node 20+.
2. Build script: `npm run build --workspace=packages/api`
3. Start command: `node packages/api/dist/index.js`
4. Set production environment variables:
   - `NODE_ENV=production`
   - `PORT=4000`
   - `MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/interview-prep?retryWrites=true&w=majority`
   - `JWT_SECRET=<random-64-character-hex-string>`
   - `SESSION_SECRET=<random-64-character-hex-string>`
   - `SESSION_COOKIE_SECURE=true`
   - `SESSION_COOKIE_SAMESITE=lax` (or `none` if frontend is hosted on a separate third-party domain)
   - `SESSION_COOKIE_DOMAIN=.yourdomain.com` (for shared multi-subdomain architectures)
   - `NEXT_PUBLIC_APP_URL=https://yourdomain.com`

### C. MongoDB Atlas Database Configuration
1. Create a free M0 cluster on MongoDB Atlas.
2. In **Network Access**, add your backend server's IP address (or `0.0.0.0/0` if hosting on serverless platforms with dynamic IPs).
3. In **Database Access**, create a user with `readWrite` permissions on the `interview-prep` database.
4. Copy the connection URI into `MONGODB_URI`. Mongoose connection pools automatically handle connection caching and auto-reconnects.

### D. Production Security, Cookies & CORS
- **CORS**: Express restricts allowed origins to `config.cors.origin` (`NEXT_PUBLIC_APP_URL`) and enforces `credentials: true`.
- **Cookies**: Session cookies are strictly `HttpOnly: true`. In production (`SESSION_COOKIE_SECURE=true`), cookies are transmitted exclusively over HTTPS.
- **CSRF**: Double Submit Cookie protection is active via `csurf` and `/api/csrf-token`.
- **Headers**: `helmet` configures Content Security Policy (CSP), hides `X-Powered-By`, and enforces XSS protection.

### E. Health Checks & Production Logging
- **Backend Health Check**: Accessible at `GET /health` and `GET /api/health`. Returns:
  ```json
  {
    "status": "ok",
    "service": "api",
    "timestamp": "2026-10-21T14:30:00.000Z",
    "database": "connected",
    "environment": "production"
  }
  ```
- **Frontend Health Check**: Accessible at `GET /api/health`.
- **Structured Logging**: `pino` outputs single-line JSON logs with timestamp, request method, route, response status, and error stack traces.

---

## 8. Environment Variable Reference

| Variable | Required in Prod | Default | Description |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `development` | Runtime mode (`development`, `test`, `production`). |
| `PORT` | No | `4000` | Port for the Express API server. |
| `MONGODB_URI` | Yes | `mongodb://localhost:27017/interview-prep` | MongoDB connection string. |
| `JWT_SECRET` | Yes | - | Secret for signing user authentication tokens (min 32 chars). |
| `JWT_EXPIRES_IN` | No | `7d` | Token lifetime duration. |
| `SESSION_SECRET` | Yes | - | Secret for signing session cookies (min 32 chars). |
| `SESSION_COOKIE_SECURE`| Yes (Prod)| `false` | Set to `true` in production to enforce HTTPS cookie transmission. |
| `SESSION_COOKIE_SAMESITE`| No | `lax` | SameSite cookie policy (`lax`, `strict`, `none`). |
| `SESSION_COOKIE_DOMAIN`| No | `""` | Optional domain scope for shared subdomains (e.g. `.company.com`). |
| `CSRF_ENABLED` | No | `true` | Enables CSRF cookie validation. |
| `LLM_PROVIDER` | No | `gemini` | Model provider: `gemini` or `openai-compat`. |
| `LLM_API_KEY` | Yes | - | API key for Gemini or OpenAI-compatible service. |
| `LLM_MODEL` | No | `gemini-1.5-flash` | Target model identifier. |
| `LLM_TEMPERATURE` | No | `0` | Generation temperature (`0` = deterministic). |
| `LLM_CONCURRENCY` | No | `3` | Max simultaneous LLM calls to prevent rate limits. |
| `LLM_MAX_RETRIES` | No | `4` | Maximum retry attempts for transient 429/503 errors. |
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:4000` | Public API endpoint consumed by the frontend. |
| `NEXT_PUBLIC_APP_URL` | Yes | `http://localhost:3000` | Public frontend URL used for CORS origins. |
| `ALLOW_LOCALHOST` | No | `false` | Set to `true` strictly during tests/CLI to allow local fixture crawling. |

---

## 9. Selected LLM Provider & Model

- **Primary Provider**: **Google Gemini API** (`gemini-1.5-flash`)
  - **Justification**: Genuine free-tier availability (15 Requests Per Minute, 1,000,000 Tokens Per Minute, 1,500 Requests Per Day), native JSON schema enforcement, fast inference, and a massive 1M-token context window that easily accommodates dense job descriptions and multi-page company research.
- **Alternative Provider**: **OpenAI-Compatible** (`gpt-4o-mini`, Groq, or Together AI)
  - Configure via `LLM_PROVIDER=openai-compat` and `LLM_BASE_URL=https://api.openai.com/v1`.
- **Deterministic Sampling**: `LLM_TEMPERATURE=0` is enforced across all generation modules to eliminate non-deterministic hallucinations and guarantee repeatable outputs.
- **Rate-Limiting Protection**: Calls are governed by `p-limit` (`concurrency: 3`) and exponential backoff retry via `p-retry` (`maxRetries: 4`) with random jitter to gracefully absorb transient 429 rate limits.

---

## 10. Retrieval Strategy & Sources Used

The public research module (`packages/api/src/modules/research/`) investigates the target company using a multi-phase discovery strategy:
1. **Homepage Scrape & Link Extraction**: Fetches the landing page, parses DOM links, resolves relative paths, and strips tracking parameters.
2. **Dynamic Link Ranking**: Discovered links are classified and weighted by relevance:
   - **Careers / Jobs** (`/careers`, `/jobs`, `/join-us`): Score +40
   - **Culture / Values** (`/about/culture`, `/values`, `/life`): Score +25
   - **Engineering Blog** (`/blog`, `/engineering`): Score +20
   - **Contextual Matching**: Links containing keywords from the job description (e.g. `typescript`, `cloud`, `distributed`) receive additional contextual bonus points.
3. **Evidence Extraction**: The top-ranked pages are fetched within budget (maximum 5 pages) to extract interview evaluation criteria, tech stack mentions, and company mission.
4. **Graceful Degradation**: If a company website lacks a careers page or blocks scraping, the pipeline falls back gracefully to extracting company context from the job description itself, outputting a valid kit with `status: "ok"`.

---

## 11. Crawling Safety & Rate Limits

- **SSRF Protection (`url-safety.ts`)**:
  - Validates protocol: only `http:` and `https:` permitted.
  - Blocks private TLDs: `.local`, `.internal`, `.corp`, `.home`, `.lan`.
  - Performs DNS resolution before connection and blocks private / loopback IP spaces:
    - `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (RFC 1918)
    - `127.0.0.0/8` (Loopback)
    - `169.254.0.0/16` (Cloud Instance Metadata Services)
    - IPv6 `::1`, `fe80::` (Link-local), `fc00::` (Unique local)
- **Robots.txt Compliance (`robots.ts`)**:
  - Automatically fetches and parses `/robots.txt`.
  - Obeys `Disallow` rules and adheres to `Crawl-delay` directives.
- **Boundaries & Budgeting**:
  - Request timeout enforced via `AbortController` (10,000 ms).
  - Maximum response size capped at 1 MB to prevent memory exhaustion from oversized assets.
  - Redirect loop protection (maximum 5 hops).
  - Domain scope pinning: crawler never follows external links off the target company's domain.

---

## 12. Generation Sequence & Coverage Second Pass

The pipeline executes a **17-step deliberate sequence**:
```
 1. validate-input               → Validates JD (min 100 chars), company URL, daysAvailable, userId
 2. normalize-input              → Strips tracking params, normalizes line breaks and whitespace
 3. extract-jd-metadata          → Extracts role metadata & requirements strictly from pasted JD
 4. crawl-company-site           → Crawls target company domain within SSRF-safe boundaries
 5. discover-hiring-pages        → Discovers and ranks relevant company, about, and hiring pages
 6. search-interview-evidence    → Searches company pages for public interview-process evidence
 7. generate-company-brief       → Generates grounded company brief using evidence actually retrieved
 8. generate-questions           → Separate generation steps for:
      8a. technical questions
      8b. behavioural questions (STAR format)
      8c. system-design questions (scoped to seniority)
      8d. company-fit questions (grounded in brief)
 9. generate-flashcards          → Generates study flashcards linked to requirement IDs
10. compute-coverage-pass-1      → Deterministic code coverage check (Pass 1)
11. identify-uncovered-musts     → Identifies all must-have requirements lacking question coverage
12. generate-gap-questions       → Generates targeted questions specifically for missing must-haves
13. recompute-coverage           → Re-evaluates coverage after gap questions
14. coverage-loop                → Repeats steps 11–13 until all must-haves covered or max passes reached
15. gap-analysis                 → If requirements remain uncovered after final pass, records gap analysis
16. generate-schedule            → Generates deterministic day-by-day plan across daysAvailable
17. finalize-kit                 → Emits progress events; validates kit schema & reference integrity
```

### Coverage Invariant:
Coverage is **never computed by an LLM prompt**. It is computed by `computeCoverage()` in [coverage.ts](file:///c:/Users/Sonu/OneDrive/Desktop/AI%20Interview%20Prep%20Kit/packages/shared/src/pipeline/coverage.ts). A requirement is covered if and only if its ID appears in `question.requirement_ids`. If any `priority === 'must'` requirement is uncovered, the orchestrator triggers Pass 2.

---

## 13. Appendix A Schema Validation

The output structure strictly adheres to the **Appendix A** specification:
- **`source`**: `company` (string), `company_url` (URL), `role` (string), `location` (string), `jd_chars` (number), `researched_at` (ISO string), `pages_used` (string array).
- **`company_brief`**: `summary` (string), `what_they_do` (string), `sources` (string array).
- **`role`**: `title` (string), `seniority` (string), `responsibilities` (string array), `requirements` (string array).
- **`requirements`**: Array of `{ id: string, text: string, kind: 'technical' | 'behavioural' | 'domain', priority: 'must' | 'nice' }`.
- **`questions`**: Array of `{ id: string, prompt: string, category: 'technical' | 'behavioural' | 'system-design' | 'company-fit', difficulty: 1 | 2 | 3, answer_outline: string, requirement_ids: string[] }`.
- **`flashcards`**: Array of `{ id: string, front: string, back: string, requirement_ids: string[] }`.
- **`schedule`**: `{ days_available: number, days: Array<{ day: number, focus: string, minutes: number, question_ids: string[] }> }`.
- **`coverage`**: `{ uncovered_requirement_ids: string[], passes: number, gap_analysis?: string }`.

All entities are verified at runtime using `validateKit()` and `validateKitReferences()`.

---

## 14. Batch Input & Output Examples

### Sample Input (`cases.example.json`)
```json
[
  {
    "id": "case-01-detailed",
    "jd": "Senior TypeScript & Node.js Engineer at Stripe. Design high-throughput payment APIs...",
    "company_url": "https://stripe.com",
    "days": 5
  },
  {
    "id": "case-02-unreachable",
    "jd": "Backend Developer at Unknown Co. Build APIs.",
    "company_url": "http://localhost:65530/unreachable",
    "days": 3
  }
]
```

### Sample Output (`kits.json`)
```json
{
  "version": "1.0",
  "generated_at": "2026-10-21T15:00:00.000Z",
  "kits": [
    {
      "id": "case-01-detailed",
      "status": "ok",
      "kit": {
        "source": {
          "company": "Stripe",
          "company_url": "https://stripe.com",
          "role": "Senior TypeScript & Node.js Engineer",
          "location": "Remote",
          "jd_chars": 1240,
          "researched_at": "2026-10-21T15:00:05.000Z",
          "pages_used": ["https://stripe.com"]
        },
        "company_brief": {
          "summary": "Stripe builds economic infrastructure for the internet.",
          "what_they_do": "Financial infrastructure, payment processing, and developer billing APIs.",
          "sources": ["https://stripe.com"]
        },
        "role": {
          "title": "Senior TypeScript & Node.js Engineer",
          "seniority": "Senior",
          "responsibilities": ["Design and implement resilient payment APIs"],
          "requirements": ["5+ years building backend microservices with Node.js"]
        },
        "requirements": [
          { "id": "req_ts_backend", "text": "5+ years building backend microservices with Node.js & TS", "kind": "technical", "priority": "must" }
        ],
        "questions": [
          {
            "id": "q_ts_event_loop_1",
            "prompt": "How does the Node.js event loop handle asynchronous I/O and microtasks?",
            "category": "technical",
            "difficulty": 2,
            "answer_outline": "Explain libuv, timers, poll phase, setImmediate, and process.nextTick.",
            "requirement_ids": ["req_ts_backend"]
          }
        ],
        "flashcards": [
          {
            "id": "fc_event_loop",
            "front": "What phase of the Node.js event loop executes process.nextTick callbacks?",
            "back": "Immediately after the current operation finishes, before transitioning between event loop phases.",
            "requirement_ids": ["req_ts_backend"]
          }
        ],
        "schedule": {
          "days_available": 5,
          "days": [
            { "day": 1, "focus": "Backend Architecture & Node.js Internals", "minutes": 45, "question_ids": ["q_ts_event_loop_1"] }
          ]
        },
        "coverage": {
          "uncovered_requirement_ids": [],
          "passes": 1
        }
      },
      "error": null
    },
    {
      "id": "case-02-unreachable",
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

---

## 15. The Exact Evaluate Command

Execute the mandatory batch evaluation CLI from the repository root:

```bash
npm run evaluate -- --input cases.example.json --output kits.json
```

- Reads the input JSON file from `--input`.
- Executes the shared 17-step pipeline on each test case concurrently (`concurrency: 2`).
- Writes valid Appendix B JSON to `--output`.
- Preserves input case ordering and IDs.

---

## 16. State Preservation & Regeneration Semantics

To guarantee that candidate work is never lost, the builder implements an explicit state machine:

1. **Entity Provenance**:
   - `provenance: 'generated'`: Autonomous output from the LLM.
   - `provenance: 'user_created'`: Manually authored question or card.
   - `edited: true`: Prompt, outline, or details modified by candidate.
   - `pinned: true`: Locked by candidate to forbid regeneration.
2. **Category Regeneration Invariants**:
   - When regenerating category $C$ (e.g. `technical`), all other categories remain untouched.
   - Within category $C$, any item that is `user_created`, `edited: true`, or `pinned: true` is **strictly preserved**.
   - Replacement draft questions matching existing prompts are deduplicated before merging.
3. **Optimistic Concurrency Control (OCC)**:
   - Every mutation checks the document's monotonic `version`.
   - Stale writes from outdated client tabs are rejected with `409 Conflict: Stale kit version`.
4. **Reference Synchronization**:
   - Deleting a question automatically removes its ID from the study schedule.
   - Deleting a requirement safely cleans references without breaking kit integrity.

---

## 17. Schedule Allocation Algorithm

Implemented entirely in application code (`allocateStudySchedule()` in [packages/shared/src/scheduler/index.ts](file:///c:/Users/Sonu/OneDrive/Desktop/AI%20Interview%20Prep%20Kit/packages/shared/src/scheduler/index.ts)):
- **Exact Requested Day Count**: Generates an array of exactly $N$ day objects (1 to $N$).
- **Early Must-Have Prioritization**: Must-have questions and difficulty 3 questions are scheduled in days 1 through $\lfloor N/2 \rfloor$.
- **Integer Minutes**: Each day allocates positive integer study minutes ($\ge 15$ min) based on question count and difficulty ratings.
- **Reference Guarantee**: Day objects only reference questions that exist in the kit's question bank.
- **Single-Day Handling**: Correctly handles 1-day crash courses by allocating all core questions with focused minute blocks.

---

## 18. Practice Mode & Weak Spots

### Deterministic Confidence-Weighted Review Queue
Active flashcards are sorted deterministically for practice via `GET /api/kits/:id/practice`:
1. **Priority Buckets**:
   - **Bucket 0 — Unreviewed**: Flashcards never reviewed appear first to guarantee coverage across all criteria.
   - **Buckets 1 to 6 — Confidence 0 through 5**: Sorted in ascending order of candidate confidence (Again/Hard before Good/Easy).
2. **Secondary Tie-Breaker**: Oldest `reviewedAt` timestamp first.
3. **Tertiary Tie-Breaker**: Alphabetical card ID (`a.id.localeCompare(b.id)`) for deterministic repeatability.

### Spaced Repetition (SuperMemo SM-2)
- Ratings $\ge 3$ (Good/Easy) advance repetition counts and multiply intervals by the updated `easeFactor`.
- Ratings $< 3$ (Again/Hard) reset intervals to 1 hour and reset repetitions to 0.

### Weak Spots Analysis (`GET /api/kits/:id/weak-spots`)
- Evaluates the intersection of requirements and practice recall performance.
- Applies a **$2.5\times$ severity multiplier** to must-have requirements.
- Flags unreviewed or struggling must-haves as `critical` risk.
- Recommends focused flashcard decks and includes a clear disclaimer that risk scoring reflects candidate self-assessment.

---

## 19. Automated Tests & Verification Commands

The test suite covers 11 test files and **228 automated test assertions**:

```bash
# Run the entire test suite across all packages
npm test

# Run tests for a specific workspace
npm test --workspace=packages/shared
npm test --workspace=packages/api
npm test --workspace=packages/web
```

### Test Suite Directory:
1. `packages/shared/src/__tests__/kit.test.ts` (Appendix A schemas & reference integrity)
2. `packages/shared/src/__tests__/scheduler.test.ts` (Deterministic study scheduler & day bin-packing)
3. `packages/api/src/__tests__/llm.test.ts` (JSON validation, normalization, prompt safety, 429 retries)
4. `packages/api/src/__tests__/pipeline.test.ts` (17-step orchestrator, coverage pass 2, gap-filling, idempotency)
5. `packages/api/src/modules/research/crawler.test.ts` (Crawler, robots.txt, dynamic link ranking, SSRF IP blocking)
6. `packages/api/src/__tests__/api.test.ts` (REST endpoints, CRUD, optimistic concurrency, pin protection)
7. `packages/api/src/__tests__/auth.test.ts` (Auth flows, bcrypt, token hashing, session expiry, multi-tenancy)
8. `packages/api/src/__tests__/batchEvaluator.test.ts` (Mandatory CLI evaluate command, Appendix B compliance)
9. `packages/api/src/__tests__/statePreservation.test.ts` (State preservation across targeted regeneration)
10. `packages/api/src/__tests__/practiceAndWeakSpots.test.ts` (Deterministic queue, SRS persistence, weak spots)
11. `packages/web/src/__tests__/kitEditor.test.tsx` (Kit builder UI, inline editing, accessible moves, modals)

---

## 20. Known Limitations & Trade-offs

1. **Deterministic Queue vs. Continuous Forgetting Curves**: The flashcard practice queue prioritizes unreviewed and struggling cards deterministically rather than calculating fractional intraday decay.
2. **Pre-Flight SSRF vs. DNS Rebinding**: `validateDestinationUrl` inspects DNS records prior to connection. While RFC 1918 addresses and AWS metadata IPs are blocked, true mitigation against dynamic 0-TTL DNS rebinding requires a custom HTTP socket pinning agent.
3. **In-Memory Pipeline Queue in Standalone Mode**: The default asynchronous job queue is held in memory for single-node simplicity. Distributed production clusters should back this with Redis / BullMQ.
4. **LLM Provider API Availability**: Live generation requires valid credentials (`GEMINI_API_KEY` or `OPENAI_API_KEY`). When keys are omitted, test suites seamlessly execute against hermetic mock clients.

---

## Video Walkthrough Checklist (3–4 Minute Demo)

- [ ] **0:00 - 0:45: Project Overview & Batch CLI**:
  - Show terminal running `npm run evaluate -- --input cases.example.json --output kits.json`.
  - Open `kits.json` to highlight Appendix B compliance, status `"ok"`, and structured Appendix A data.
- [ ] **0:45 - 1:30: Kit Generation & Coverage Invariant**:
  - Open the web dashboard at `http://localhost:3000`.
  - Submit a new Job Description, company URL, and 5 preparation days.
  - Show real-time progress steps and the deterministic coverage indicator verifying must-haves.
- [ ] **1:30 - 2:30: Interactive Kit Builder & State Preservation**:
  - Edit a question prompt inline and toggle the **Pin** icon.
  - Reorder questions using accessible controls.
  - Trigger a category regeneration and demonstrate that the edited and pinned questions survived.
- [ ] **2:30 - 3:30: Active Recall Practice & Weak Spots**:
  - Navigate to the **Practice Mode** tab.
  - Flip a flashcard using the Spacebar and rate confidence using Keys 1–4.
  - Open the **Weak Spots** tab to show identified risk topics, $2.5\times$ must-have weighting, and targeted practice recommendations.

---

## License

MIT License. Authored for the Trao Assessment.