import { describe, it, expect } from 'vitest';
import {
  allocateStudySchedule,
  generateSchedule,
  validateSchedule,
} from '@interview-prep/shared/scheduler';
import type { Requirement, Question } from '@interview-prep/shared/schema/kit';

describe('Deterministic Study Schedule Allocator (allocateStudySchedule)', () => {
  const baseRequirements: Requirement[] = [
    { id: 'req-1', text: 'TypeScript', kind: 'technical', priority: 'must' },
    { id: 'req-2', text: 'Distributed Systems', kind: 'technical', priority: 'must' },
    { id: 'req-3', text: 'Team Communication', kind: 'behavioural', priority: 'must' },
    { id: 'req-4', text: 'GraphQL API', kind: 'technical', priority: 'nice' },
    { id: 'req-5', text: 'Company Mission Alignment', kind: 'domain', priority: 'nice' },
  ];

  const baseQuestions: Question[] = [
    { id: 'q-ts-1', requirement_ids: ['req-1'], category: 'technical', prompt: 'TS conditional types', answer_outline: '', difficulty: 2 },
    { id: 'q-ds-hard', requirement_ids: ['req-2'], category: 'system-design', prompt: 'Design partitioned raft cluster', answer_outline: '', difficulty: 3 },
    { id: 'q-comm-1', requirement_ids: ['req-3'], category: 'behavioural', prompt: 'Resolving technical disagreements', answer_outline: '', difficulty: 1 },
    { id: 'q-gql-nice', requirement_ids: ['req-4'], category: 'technical', prompt: 'GraphQL schema federation', answer_outline: '', difficulty: 2 },
    { id: 'q-fit-nice', requirement_ids: ['req-5'], category: 'company-fit', prompt: 'Why Acme Payments?', answer_outline: '', difficulty: 1 },
  ];

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Exact Day Counts (1, 3, 5, 60 days)
  // ──────────────────────────────────────────────────────────────────────────
  it('handles a 1-day schedule with exact day count and all questions allocated', () => {
    const result = allocateStudySchedule(
      { requirements: baseRequirements, questions: baseQuestions },
      1
    );

    expect(result.days_available).toBe(1);
    expect(result.days.length).toBe(1);
    expect(result.days[0]?.day).toBe(1);
    expect(Number.isInteger(result.days[0]?.minutes)).toBe(true);
    expect(result.days[0]?.minutes).toBeGreaterThan(0);

    // All 5 questions must be scheduled on the single day
    const day1QIds = new Set(result.days[0]?.question_ids);
    for (const q of baseQuestions) {
      expect(day1QIds.has(q.id)).toBe(true);
    }
  });

  it('handles a 3-day schedule with balanced distribution and consecutive days', () => {
    const result = allocateStudySchedule(
      { requirements: baseRequirements, questions: baseQuestions },
      3
    );

    expect(result.days_available).toBe(3);
    expect(result.days.length).toBe(3);
    expect(result.days.map((d) => d.day)).toEqual([1, 2, 3]);

    const scheduledQIds = new Set(result.days.flatMap((d) => d.question_ids));
    for (const q of baseQuestions) {
      expect(scheduledQIds.has(q.id)).toBe(true);
    }
  });

  it('handles a 5-day schedule allocating every question with positive minutes', () => {
    const result = allocateStudySchedule(
      { requirements: baseRequirements, questions: baseQuestions },
      5
    );

    expect(result.days_available).toBe(5);
    expect(result.days.length).toBe(5);
    expect(result.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);

    const scheduledQIds = new Set(result.days.flatMap((d) => d.question_ids));
    for (const q of baseQuestions) {
      expect(scheduledQIds.has(q.id)).toBe(true);
    }

    for (const day of result.days) {
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.minutes).toBeGreaterThan(0);
      expect(day.minutes).toBeLessThanOrEqual(480);
    }
  });

  it('handles a 60-day schedule without fabricating fake requirements', () => {
    const result = allocateStudySchedule(
      { requirements: baseRequirements, questions: baseQuestions },
      60
    );

    expect(result.days_available).toBe(60);
    expect(result.days.length).toBe(60);

    // Day numbers must be strictly consecutive 1..60
    const dayNums = result.days.map((d) => d.day);
    expect(dayNums[0]).toBe(1);
    expect(dayNums[59]).toBe(60);
    for (let i = 0; i < 60; i++) {
      expect(dayNums[i]).toBe(i + 1);
    }

    // Every original question is scheduled in active days
    const allScheduled = new Set(result.days.flatMap((d) => d.question_ids));
    for (const q of baseQuestions) {
      expect(allScheduled.has(q.id)).toBe(true);
    }

    // Remaining days are explicit review days without inventing nonexistent question IDs
    for (const day of result.days) {
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.minutes).toBeGreaterThan(0);
      expect(day.focus.length).toBeGreaterThan(0);
    }

    const validation = validateSchedule(result.schedule);
    expect(validation.valid).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Empty Question Banks
  // ──────────────────────────────────────────────────────────────────────────
  it('handles empty question banks honestly with structured review phases', () => {
    const result = allocateStudySchedule(
      { requirements: baseRequirements, questions: [] },
      5
    );

    expect(result.days_available).toBe(5);
    expect(result.days.length).toBe(5);

    for (const day of result.days) {
      expect(day.question_ids).toEqual([]);
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.minutes).toBeGreaterThan(0);
      expect(day.focus.length).toBeGreaterThan(0);
    }

    const validation = validateSchedule(result.schedule);
    expect(validation.valid).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. All-Must Requirements vs Mixed Priorities
  // ──────────────────────────────────────────────────────────────────────────
  it('schedules difficult and must-have material early', () => {
    const result = allocateStudySchedule(
      { requirements: baseRequirements, questions: baseQuestions },
      5
    );

    // Hard must question (q-ds-hard: priority=must, difficulty=3) should be on Day 1
    const day1 = result.days[0]!;
    expect(day1.question_ids).toContain('q-ds-hard');

    // Nice-to-have questions should appear later than must questions
    const niceDayIdx = result.days.findIndex((d) => d.question_ids.includes('q-gql-nice') || d.question_ids.includes('q-fit-nice'));
    const hardMustDayIdx = result.days.findIndex((d) => d.question_ids.includes('q-ds-hard'));
    expect(niceDayIdx).toBeGreaterThanOrEqual(hardMustDayIdx);
  });

  it('handles all-must requirements correctly', () => {
    const allMustReqs: Requirement[] = [
      { id: 'm-1', text: 'Skill 1', kind: 'technical', priority: 'must' },
      { id: 'm-2', text: 'Skill 2', kind: 'technical', priority: 'must' },
    ];
    const allMustQs: Question[] = [
      { id: 'qm-1', requirement_ids: ['m-1'], category: 'technical', prompt: 'P1', answer_outline: '', difficulty: 3 },
      { id: 'qm-2', requirement_ids: ['m-2'], category: 'technical', prompt: 'P2', answer_outline: '', difficulty: 1 },
    ];

    const result = allocateStudySchedule({ requirements: allMustReqs, questions: allMustQs }, 3);
    expect(result.days.length).toBe(3);

    // Harder must (difficulty 3) goes on day 1
    expect(result.days[0]?.question_ids).toContain('qm-1');
    expect(result.days[1]?.question_ids).toContain('qm-2');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Question Reference Integrity (No Fake Question IDs)
  // ──────────────────────────────────────────────────────────────────────────
  it('never refers to nonexistent question IDs in any day', () => {
    const validQIds = new Set(baseQuestions.map((q) => q.id));
    const result = allocateStudySchedule(
      { requirements: baseRequirements, questions: baseQuestions },
      10
    );

    for (const day of result.days) {
      for (const qId of day.question_ids) {
        expect(validQIds.has(qId)).toBe(true);
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Complete Coverage of Schedulable Material
  // ──────────────────────────────────────────────────────────────────────────
  it('allocates every required question across the schedule without dropping any', () => {
    const manyQuestions: Question[] = Array.from({ length: 15 }, (_, i) => ({
      id: `q-many-${i + 1}`,
      requirement_ids: [`req-${(i % 5) + 1}`],
      category: 'technical',
      prompt: `Prompt ${i + 1}`,
      answer_outline: '',
      difficulty: ((i % 3) + 1) as 1 | 2 | 3,
    }));

    const result = allocateStudySchedule(
      { requirements: baseRequirements, questions: manyQuestions },
      4
    );

    const scheduledQIds = new Set(result.days.flatMap((d) => d.question_ids));
    expect(scheduledQIds.size).toBe(15);
    for (const q of manyQuestions) {
      expect(scheduledQIds.has(q.id)).toBe(true);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Determinism: Identical Outputs for Identical Inputs
  // ──────────────────────────────────────────────────────────────────────────
  it('produces 100% deterministic outputs for identical inputs', () => {
    const r1 = allocateStudySchedule({ requirements: baseRequirements, questions: baseQuestions }, 7);
    const r2 = allocateStudySchedule({ requirements: baseRequirements, questions: baseQuestions }, 7);

    expect(r1.days).toEqual(r2.days);
    expect(r1.totalMinutes).toBe(r2.totalMinutes);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Backward Compatibility with generateSchedule
  // ──────────────────────────────────────────────────────────────────────────
  it('generateSchedule wrapper functions identically and passes validateSchedule', () => {
    const { schedule, totalMinutes } = generateSchedule({
      requirements: baseRequirements,
      questions: baseQuestions,
      daysAvailable: 14,
    });

    expect(schedule.days_available).toBe(14);
    expect(schedule.days.length).toBe(14);
    expect(totalMinutes).toBeGreaterThan(0);

    const validation = validateSchedule(schedule);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });
});