import { describe, it, expect } from 'vitest';
import { generateSchedule, validateSchedule } from '@interview-prep/shared/scheduler';
import type { Requirement, Question } from '@interview-prep/shared/schema/kit';

describe('generateSchedule', () => {
  const baseRequirements: Requirement[] = [
    { id: 'req-1', text: 'TypeScript', kind: 'technical', priority: 'must' },
    { id: 'req-2', text: 'React', kind: 'technical', priority: 'must' },
    { id: 'req-3', text: 'Communication', kind: 'behavioural', priority: 'must' },
    { id: 'req-4', text: 'GraphQL', kind: 'technical', priority: 'nice' },
  ];

  const baseQuestions: Question[] = [
    { id: 'q-1', requirement_ids: ['req-1'], category: 'technical', prompt: 'TS generics', answer_outline: '', difficulty: 2 },
    { id: 'q-2', requirement_ids: ['req-2'], category: 'technical', prompt: 'React hooks', answer_outline: '', difficulty: 2 },
    { id: 'q-3', requirement_ids: ['req-3'], category: 'behavioural', prompt: 'Conflict', answer_outline: '', difficulty: 1 },
    { id: 'q-4', requirement_ids: ['req-4'], category: 'technical', prompt: 'GraphQL schema', answer_outline: '', difficulty: 3 },
  ];

  it('produces exactly daysAvailable days', () => {
    const { schedule } = generateSchedule({
      requirements: baseRequirements,
      questions: baseQuestions,
      daysAvailable: 14,
      minutesPerDay: 180,
    });
    expect(schedule.days.length).toBe(14);
    expect(schedule.days_available).toBe(14);
  });

  it('produces consecutive days starting from 1', () => {
    const { schedule } = generateSchedule({
      requirements: baseRequirements,
      questions: baseQuestions,
      daysAvailable: 7,
      minutesPerDay: 180,
    });
    const dayNumbers = schedule.days.map(d => d.day).sort((a, b) => a - b);
    expect(dayNumbers).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('assigns positive integer minutes to each day', () => {
    const { schedule } = generateSchedule({
      requirements: baseRequirements,
      questions: baseQuestions,
      daysAvailable: 5,
      minutesPerDay: 180,
    });
    for (const day of schedule.days) {
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.minutes).toBeGreaterThan(0);
      expect(day.minutes).toBeLessThanOrEqual(480);
    }
  });

  it('prioritizes must requirements over nice', () => {
    const { schedule } = generateSchedule({
      requirements: baseRequirements,
      questions: baseQuestions,
      daysAvailable: 2,
      minutesPerDay: 180,
    });
    expect(schedule.days.length).toBeGreaterThan(0);
    const day1QIds = schedule.days[0]!.question_ids;
    const hasMust = day1QIds.some(id => ['q-1', 'q-2', 'q-3'].includes(id));
    expect(hasMust).toBe(true);
  });

  it('schedules all questions when enough days', () => {
    const { schedule } = generateSchedule({
      requirements: baseRequirements,
      questions: baseQuestions,
      daysAvailable: 10,
      minutesPerDay: 180,
    });
    const allScheduled = new Set(schedule.days.flatMap(d => d.question_ids));
    for (const q of baseQuestions) {
      expect(allScheduled.has(q.id)).toBe(true);
    }
  });

  it('handles zero questions gracefully', () => {
    const { schedule } = generateSchedule({
      requirements: [],
      questions: [],
      daysAvailable: 3,
      minutesPerDay: 180,
    });
    expect(schedule.days.length).toBe(3);
    for (const day of schedule.days) {
      expect(day.minutes).toBeGreaterThanOrEqual(0);
    }
  });

  it('respects minutesPerDay limit', () => {
    const { schedule } = generateSchedule({
      requirements: baseRequirements,
      questions: baseQuestions,
      daysAvailable: 5,
      minutesPerDay: 60,
    });
    for (const day of schedule.days) {
      expect(day.minutes).toBeLessThanOrEqual(60);
    }
  });

  it('includes focus for each day', () => {
    const { schedule } = generateSchedule({
      requirements: baseRequirements,
      questions: baseQuestions,
      daysAvailable: 5,
      minutesPerDay: 180,
    });
    for (const day of schedule.days) {
      expect(day.focus).toBeDefined();
      expect(day.focus.length).toBeGreaterThan(0);
    }
  });
});

describe('validateSchedule', () => {
  it('passes valid schedule', () => {
    const schedule = {
      days_available: 3,
      days: [
        { day: 1, focus: 'Day 1', question_ids: ['q-1'], minutes: 180 },
        { day: 2, focus: 'Day 2', question_ids: ['q-2'], minutes: 180 },
        { day: 3, focus: 'Day 3', question_ids: ['q-3'], minutes: 180 },
      ],
    };
    const result = validateSchedule(schedule);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when days count mismatches days_available', () => {
    const schedule = {
      days_available: 5,
      days: [
        { day: 1, focus: 'Day 1', question_ids: [], minutes: 180 },
      ],
    };
    const result = validateSchedule(schedule);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('days_available'))).toBe(true);
  });

  it('fails when days are not consecutive', () => {
    const schedule = {
      days_available: 3,
      days: [
        { day: 1, focus: 'Day 1', question_ids: [], minutes: 180 },
        { day: 3, focus: 'Day 3', question_ids: [], minutes: 180 },
      ],
    };
    const result = validateSchedule(schedule);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('consecutive'))).toBe(true);
  });

  it('fails when minutes are non-positive', () => {
    const schedule = {
      days_available: 2,
      days: [
        { day: 1, focus: 'Day 1', question_ids: [], minutes: 0 },
        { day: 2, focus: 'Day 2', question_ids: [], minutes: 180 },
      ],
    };
    const result = validateSchedule(schedule);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('non-positive'))).toBe(true);
  });

  it('fails when minutes exceed 480', () => {
    const schedule = {
      days_available: 1,
      days: [
        { day: 1, focus: 'Day 1', question_ids: [], minutes: 500 },
      ],
    };
    const result = validateSchedule(schedule);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('480'))).toBe(true);
  });

  it('fails when day number is out of range', () => {
    const schedule = {
      days_available: 3,
      days: [
        { day: 0, focus: 'Day 0', question_ids: [], minutes: 180 },
        { day: 2, focus: 'Day 2', question_ids: [], minutes: 180 },
        { day: 3, focus: 'Day 3', question_ids: [], minutes: 180 },
      ],
    };
    const result = validateSchedule(schedule);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('consecutive') || e.includes('gap'))).toBe(true);
  });
});