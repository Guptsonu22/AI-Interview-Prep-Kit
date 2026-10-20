import type { Requirement, Question, Day, Schedule } from '../schema/kit';

export interface SchedulerInput {
  requirements: Requirement[];
  questions: Question[];
  daysAvailable: number;
  minutesPerDay: number;
}

export interface SchedulerOutput {
  schedule: Schedule;
  totalMinutes: number;
}

export function generateSchedule(input: SchedulerInput): SchedulerOutput {
  const { requirements, questions, daysAvailable, minutesPerDay } = input;

  const mustReqs = requirements.filter(r => r.priority === 'must');
  const niceReqs = requirements.filter(r => r.priority === 'nice');

  const mustQuestions = questions.filter(q =>
    q.requirement_ids.some(id => mustReqs.some(r => r.id === id))
  );
  const niceQuestions = questions.filter(q =>
    q.requirement_ids.some(id => niceReqs.some(r => r.id === id))
  );

  const sortedQuestions = [
    ...mustQuestions.sort((a, b) => a.difficulty - b.difficulty),
    ...niceQuestions.sort((a, b) => a.difficulty - b.difficulty),
  ];

  const days: Day[] = [];
  let qIndex = 0;
  let remainingMinutesInDay = minutesPerDay;

  for (let dayNum = 1; dayNum <= daysAvailable; dayNum++) {
    const dayQuestions: string[] = [];
    let dayMinutes = 0;
    let focus = 'Review';

    while (remainingMinutesInDay > 0 && qIndex < sortedQuestions.length) {
      const q = sortedQuestions[qIndex];
      if (!q) break;
      const qMinutes = estimateQuestionMinutes(q);

      if (qMinutes <= remainingMinutesInDay) {
        dayQuestions.push(q.id);
        dayMinutes += qMinutes;
        remainingMinutesInDay -= qMinutes;
        qIndex++;
        if (!focus || focus === 'Review') {
          focus = q.category;
        }
      } else {
        break;
      }
    }

    if (dayQuestions.length === 0 && qIndex >= sortedQuestions.length) {
      focus = 'Review & Mock';
      dayQuestions.push('review');
      dayMinutes = Math.min(60, minutesPerDay);
    } else if (dayQuestions.length === 0) {
      focus = 'Buffer / Review';
      dayMinutes = 0;
    }

    days.push({
      day: dayNum,
      focus,
      question_ids: dayQuestions,
      minutes: dayMinutes,
    });

    remainingMinutesInDay = minutesPerDay;
  }

  if (qIndex < sortedQuestions.length) {
    const lastDay = days[days.length - 1];
    if (lastDay) {
      for (let i = qIndex; i < sortedQuestions.length; i++) {
        const q = sortedQuestions[i];
        if (q) {
          lastDay.question_ids.push(q.id);
          lastDay.minutes += estimateQuestionMinutes(q);
        }
      }
      lastDay.focus = lastDay.focus + ' + Remaining';
    }
  }

  const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0);

  return {
    schedule: {
      days_available: daysAvailable,
      days,
    },
    totalMinutes,
  };
}

function estimateQuestionMinutes(q: Question): number {
  const base = { 1: 20, 2: 35, 3: 50 };
  return base[q.difficulty as keyof typeof base] ?? 30;
}

export function validateSchedule(schedule: Schedule): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (schedule.days.length !== schedule.days_available) {
    errors.push(`Schedule has ${schedule.days.length} days but days_available is ${schedule.days_available}`);
  }

  const dayNumbers = schedule.days.map(d => d.day).sort((a, b) => a - b);
  for (let i = 0; i < dayNumbers.length; i++) {
    if (dayNumbers[i] !== i + 1) {
      errors.push(`Schedule days must be consecutive starting from 1, found gap at day ${i + 1}`);
    }
  }

  for (const day of schedule.days) {
    if (day.minutes <= 0) {
      errors.push(`Day ${day.day} has non-positive minutes`);
    }
    if (day.minutes > 480) {
      errors.push(`Day ${day.day} exceeds 8 hours (480 minutes)`);
    }
  }

  return { valid: errors.length === 0, errors };
}