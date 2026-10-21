/**
 * Deterministic Study Schedule Allocator
 *
 * Implements the study schedule entirely in application code without LLM calls.
 *
 * Requirements:
 *  1. Every must-have requirement appears in at least one scheduled question (if question exists)
 *  2. Prioritize must-have requirements above nice-to-have requirements
 *  3. Schedule difficult and high-priority material early
 *  4. Include relevant company research and behavioural preparation in the study plan
 *  5. Do not refer to nonexistent question IDs
 *  6. Do not schedule a question multiple times unless repetition is intentional and documented
 *  7. Allocate every required question across the schedule
 *  8. Handle a 1-day schedule
 *  9. Handle a 60-day schedule without fabricating new requirements
 * 10. Handle empty questions and sparse descriptions honestly
 * 11. All durations must be non-negative integer minutes (positive for active/review sessions)
 * 12. Keep durations deterministic for identical inputs
 * 13. Ensure the number of days is exact (days.length === days_available)
 */

import type { Requirement, Question, Day, Schedule } from '../schema/kit';

export interface SchedulerInput {
  requirements?: Requirement[];
  questions?: Question[];
  daysAvailable?: number;
  minutesPerDay?: number;
}

export interface AllocatedScheduleResult extends Schedule {
  schedule: Schedule;
  totalMinutes: number;
}

/**
 * Standard duration mapping per question based on difficulty.
 */
function getQuestionMinutes(q: Question): number {
  switch (q.difficulty) {
    case 1:
      return 20;
    case 3:
      return 50;
    case 2:
    default:
      return 35;
  }
}

/**
 * Deterministic study schedule allocator.
 * Can be called as:
 *   allocateStudySchedule(kit, daysAvailable)
 *   allocateStudySchedule({ requirements, questions }, daysAvailable)
 */
export function allocateStudySchedule(
  kitOrInput:
    | {
        requirements?: Requirement[];
        questions?: Question[];
        schedule?: { days_available?: number };
      }
    | Requirement[],
  daysAvailableParam?: number
): AllocatedScheduleResult {
  let requirements: Requirement[] = [];
  let questions: Question[] = [];
  let daysAvailable = 7;

  // Handle flexible argument signatures
  if (Array.isArray(kitOrInput)) {
    requirements = kitOrInput;
    daysAvailable = daysAvailableParam ?? 7;
  } else if (typeof kitOrInput === 'object' && kitOrInput !== null) {
    requirements = kitOrInput.requirements ?? [];
    questions = kitOrInput.questions ?? [];
    daysAvailable =
      daysAvailableParam ??
      (kitOrInput as any).daysAvailable ??
      kitOrInput.schedule?.days_available ??
      7;
  }

  const requestedDays = Math.max(1, Math.floor(daysAvailable));

  // Build lookup maps for fast access
  const mustReqIds = new Set(
    requirements.filter((r) => r.priority === 'must').map((r) => r.id)
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Deterministic Ranking Strategy:
  //  1. Priority: Must questions before Nice questions
  //  2. Difficulty: Difficulty 3 (hardest) before 2 before 1
  //  3. Category: System-design & Technical early, Behavioural & Company-fit follow
  //  4. Alphabetical tie-breaker on ID for 100% determinism
  // ──────────────────────────────────────────────────────────────────────────
  const categoryOrder: Record<string, number> = {
    'system-design': 1,
    technical: 2,
    behavioural: 3,
    'company-fit': 4,
  };

  const rankedQuestions = [...questions].sort((a, b) => {
    const aIsMust = a.requirement_ids.some((id) => mustReqIds.has(id));
    const bIsMust = b.requirement_ids.some((id) => mustReqIds.has(id));

    if (aIsMust !== bIsMust) {
      return aIsMust ? -1 : 1;
    }

    // Schedule difficult material early (Difficulty 3 > Difficulty 2 > Difficulty 1)
    if (a.difficulty !== b.difficulty) {
      return b.difficulty - a.difficulty;
    }

    // Category ordering
    const aCat = categoryOrder[a.category] ?? 5;
    const bCat = categoryOrder[b.category] ?? 5;
    if (aCat !== bCat) {
      return aCat - bCat;
    }

    // Stable tie breaker
    return a.id.localeCompare(b.id);
  });

  const totalQuestions = rankedQuestions.length;
  const days: Day[] = [];

  // ──────────────────────────────────────────────────────────────────────────
  // Special Case: 1-Day Schedule
  // ──────────────────────────────────────────────────────────────────────────
  if (requestedDays === 1) {
    const questionIds = rankedQuestions.map((q) => q.id);
    const rawMinutes = rankedQuestions.reduce((sum, q) => sum + getQuestionMinutes(q), 0);
    // Integer minutes, capped at maximum 480 (8 hours), min 45
    const minutes = totalQuestions > 0 ? Math.min(480, Math.max(30, rawMinutes)) : 60;

    let focus = 'Intensive Comprehensive Preparation';
    if (totalQuestions === 0) {
      focus = 'Role Exploration & Company Research';
    } else if (rankedQuestions.some((q) => q.requirement_ids.some((id) => mustReqIds.has(id)))) {
      focus = 'Must-Have Requirements & Technical Drill';
    }

    days.push({
      day: 1,
      focus,
      question_ids: questionIds,
      minutes,
    });

    const schedule: Schedule = { days_available: 1, days };
    return {
      days_available: 1,
      days,
      schedule,
      totalMinutes: minutes,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Multi-Day Schedule Allocation
  // ──────────────────────────────────────────────────────────────────────────

  // Determine how many days should contain new questions vs review/mock days
  // All questions MUST be scheduled (Rule 7).
  // If requestedDays <= totalQuestions: distribute across all requestedDays
  // If requestedDays > totalQuestions: use primary days for questions, and remaining
  // days for structured review, mock practice, and recap (Rules 6, 9, 10).
  const activeDaysCount = Math.min(requestedDays, Math.max(1, totalQuestions));

  // Partition questions across activeDaysCount using deterministic round-robin / bucket allocation
  const questionBuckets: Question[][] = Array.from({ length: requestedDays }, () => []);

  if (totalQuestions > 0) {
    if (activeDaysCount >= totalQuestions) {
      // 1 question per day for first totalQuestions days
      for (let i = 0; i < totalQuestions; i++) {
        const q = rankedQuestions[i];
        if (q) questionBuckets[i]!.push(q);
      }
    } else {
      // More questions than days: chunk questions evenly across activeDaysCount
      const baseCount = Math.floor(totalQuestions / activeDaysCount);
      const extra = totalQuestions % activeDaysCount;
      let qIdx = 0;

      for (let dayIdx = 0; dayIdx < activeDaysCount; dayIdx++) {
        const count = baseCount + (dayIdx < extra ? 1 : 0);
        for (let j = 0; j < count; j++) {
          const q = rankedQuestions[qIdx++];
          if (q) questionBuckets[dayIdx]!.push(q);
        }
      }
    }
  }

  // Predefined review and preparation themes for days without new questions
  const reviewThemes = [
    'Spaced Repetition & Weak-Spot Review',
    'System Architecture & Design Synthesis',
    'Behavioural Stories & STAR Framework Practice',
    'Company Culture & Strategy Alignment',
    'Mock Interview Simulation & Timed Drills',
    'Flashcard Reinforcement & Concept Review',
    'Logistics, Questions for Interviewer & Final Recap',
  ];

  // Construct day objects
  for (let dayNum = 1; dayNum <= requestedDays; dayNum++) {
    const bucket = questionBuckets[dayNum - 1] ?? [];
    const qIds = bucket.map((q) => q.id);

    let dayFocus = '';
    let dayMinutes = 0;

    if (bucket.length > 0) {
      // Active study day
      const rawMins = bucket.reduce((sum, q) => sum + getQuestionMinutes(q), 0);
      dayMinutes = Math.min(480, Math.max(30, rawMins));

      // Determine focus from questions in bucket
      const hasSystemDesign = bucket.some((q) => q.category === 'system-design');
      const hasTechnical = bucket.some((q) => q.category === 'technical');
      const hasBehavioural = bucket.some((q) => q.category === 'behavioural');
      const hasCompanyFit = bucket.some((q) => q.category === 'company-fit');
      const hasMust = bucket.some((q) => q.requirement_ids.some((id) => mustReqIds.has(id)));

      if (hasSystemDesign && hasTechnical) {
        dayFocus = hasMust
          ? 'Must-Have System Design & Technical Architecture'
          : 'System Architecture & Technical Depth';
      } else if (hasSystemDesign) {
        dayFocus = 'System Architecture & Scalability';
      } else if (hasCompanyFit && hasBehavioural) {
        dayFocus = 'Company Alignment & Behavioural Leadership';
      } else if (hasCompanyFit) {
        dayFocus = 'Company Research, Values & Role Fit';
      } else if (hasBehavioural) {
        dayFocus = 'Behavioural Competencies & STAR Stories';
      } else if (hasTechnical) {
        const avgDiff = bucket.reduce((sum, q) => sum + q.difficulty, 0) / bucket.length;
        if (avgDiff >= 2.5) {
          dayFocus = 'Advanced Technical Topics & Problem Solving';
        } else {
          dayFocus = hasMust
            ? 'Core Must-Have Technical Skills'
            : 'Technical Foundations & Coding Practice';
        }
      } else {
        dayFocus = 'Core Competencies & Practice';
      }
    } else {
      // Sparse kit or review day (honest lightweight review, no invented questions)
      const themeIdx = (dayNum - activeDaysCount - 1) % reviewThemes.length;
      dayFocus = reviewThemes[Math.max(0, themeIdx)] ?? 'Review & Self-Assessment';
      // 30 to 45 minutes for review/rest
      dayMinutes = dayNum === requestedDays ? 30 : 45;
    }

    days.push({
      day: dayNum,
      focus: dayFocus,
      question_ids: qIds,
      minutes: Math.round(dayMinutes),
    });
  }

  const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0);
  const schedule: Schedule = {
    days_available: requestedDays,
    days,
  };

  return {
    days_available: requestedDays,
    days,
    schedule,
    totalMinutes,
  };
}

/**
 * Backward-compatible wrapper for existing pipeline and callers.
 */
export function generateSchedule(input: SchedulerInput): {
  schedule: Schedule;
  totalMinutes: number;
} {
  const result = allocateStudySchedule(
    {
      requirements: input.requirements,
      questions: input.questions,
    },
    input.daysAvailable
  );

  return {
    schedule: result.schedule,
    totalMinutes: result.totalMinutes,
  };
}

/**
 * Validates structural and business constraints of a generated schedule.
 */
export function validateSchedule(schedule: Schedule): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (schedule.days.length !== schedule.days_available) {
    errors.push(
      `Schedule has ${schedule.days.length} days but days_available is ${schedule.days_available}`
    );
  }

  const dayNumbers = schedule.days.map((d) => d.day).sort((a, b) => a - b);
  for (let i = 0; i < dayNumbers.length; i++) {
    if (dayNumbers[i] !== i + 1) {
      errors.push(
        `Schedule days must be consecutive starting from 1, found gap at day ${i + 1}`
      );
    }
  }

  for (const day of schedule.days) {
    if (!Number.isInteger(day.minutes) || day.minutes <= 0) {
      errors.push(`Day ${day.day} has non-positive or non-integer minutes: ${day.minutes}`);
    }
    if (day.minutes > 480) {
      errors.push(`Day ${day.day} exceeds 8 hours (480 minutes)`);
    }
    if (!day.focus || day.focus.trim().length === 0) {
      errors.push(`Day ${day.day} has empty focus`);
    }
  }

  return { valid: errors.length === 0, errors };
}