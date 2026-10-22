# AI Interview Prep Kit — Testing & Usage Guide

> **Current System Status**:
> - **Localhost**: Frontend (`http://localhost:3000`) & Backend (`http://localhost:4000`) are active and healthy.
> - **Production Backend (Render)**: `https://ai-interview-prep-kit-kcdp.onrender.com/api/health` — Status: `ok`, MongoDB Atlas: `connected`.
> - **Production Frontend (Vercel)**: `https://ai-interview-prep-kit-lac.vercel.app/` — Status: `ok`.
> - **Automated Test Suite**: 296 / 296 tests passing (100% PASS), 0 lint errors, 0 TypeScript errors.

---

## 1. Quick Access Links

| Environment | Frontend URL | Backend Health Check |
| :--- | :--- | :--- |
| **Local (Development)** | [http://localhost:3000](http://localhost:3000) | [http://localhost:4000/api/health](http://localhost:4000/api/health) |
| **Production (Cloud)** | [https://ai-interview-prep-kit-lac.vercel.app](https://ai-interview-prep-kit-lac.vercel.app) | [https://ai-interview-prep-kit-kcdp.onrender.com/api/health](https://ai-interview-prep-kit-kcdp.onrender.com/api/health) |

---

## 2. Step-by-Step Feature Walkthrough (Kaise Use Karein)

### Step 1: Account Registration & Login
1. Go to:
   - **Local**: `http://localhost:3000/auth/register`
   - **Production**: `https://ai-interview-prep-kit-lac.vercel.app/auth/register`
2. Enter Name, Email (e.g. `testuser@example.com`), and Password (min 8 chars, 1 uppercase, 1 special char, e.g. `PrepMaster123!`).
3. Click **Create Account**. You will be logged in and redirected to your **Dashboard**.

### Step 2: Generate an AI Preparation Kit
1. From the Dashboard, click **Create New Kit** (or go to `/kits/new`).
2. Enter:
   - **Target Role**: e.g. `Senior Backend Engineer`
   - **Company**: e.g. `Stripe`
   - **Experience Level**: `Senior`
   - **Focus Areas**: Select `System Design`, `Backend / Databases`, `Behavioral (STAR)`.
   - **Job Description**: Paste any real job description or click **Load Sample** (loads a full Stripe infrastructure JD).
3. Click **Generate Preparation Kit**.
4. The system maps competencies and generates:
   - Categorized Questions (Technical, System Design, Behavioral, Situational)
   - Company Intelligence Brief
   - 7-Day Spaced Repetition Study Plan

### Step 3: Explore & Customize the Kit Workspace (`/kits/[id]`)
1. **Questions Tab**:
   - Filter by categories.
   - **Pin Questions**: Click the pin icon on key questions to prioritize them.
   - **Inline Edit**: Edit any prompt or sample outline and click save.
2. **Company Brief Tab**:
   - Review company culture, interview stages, and focus areas.
3. **Study Schedule Tab**:
   - Day-by-day preparation schedule.

### Step 4: Spaced Repetition Practice Mode (Flashcards)
1. Click **Practice Mode** at top-right.
2. View the question prompt flashcard.
3. Click **Flip / Reveal Answer**.
4. Rate your recall confidence from **1 (Forgot completely)** to **5 (Mastered)**.
5. The SM-2 spaced repetition algorithm updates next review dates and difficulty scores.
6. Check **Weak Spots** to identify competencies that need revision.

### Step 5: Test Multi-Tenant Security & Isolation
1. Click **Log Out**.
2. Register a second account with another email.
3. The dashboard is clean with 0 kits.
4. Try pasting the first user's kit URL — access is strictly forbidden (`404 / 403 Kit Not Found or Unauthorized`).

---

## 3. Resolving the "Request failed with status code 401"

If you see a `401 Unauthorized` error:
1. **Log out and Log in again**: Go to `/auth/login`. This issues a fresh session token and cookie.
2. **Cross-Site Cookies**: We have already enabled **Bearer token authentication** alongside session cookies to prevent third-party cookie blocking between Vercel and Render.
3. **Clear Site Data**: If you have old session cookies in your browser, press `F12` -> Application -> Storage -> Clear site data, then log in fresh.

---

## 4. Automated Testing Commands

Run from the project root in PowerShell:
```bash
# Run all 296 unit and integration tests:
npm test

# Check TypeScript types (0 errors):
npm run typecheck

# Check code linting (0 errors):
npm run lint

# Build full production bundle:
npm run build
```

---

## 5. Local Server Controls

```bash
# Start Backend (port 4000)
npm run dev --workspace=backend

# Start Frontend (port 3000)
npm run dev --workspace=frontend
```
