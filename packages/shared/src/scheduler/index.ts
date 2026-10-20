import { StudyTopic, DailyScheduleItem } from '../schema/kit';

export interface SchedulerInput {
  topics: StudyTopic[];
  prepDays: number;
  startDate: Date;
  hoursPerDay: number;
}

export interface SchedulerOutput {
  dailySchedule: DailyScheduleItem[];
  totalHours: number;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  const iso = date.toISOString();
  const parts = iso.split('T');
  return parts[0] ?? iso;
}

const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function generateSchedule(input: SchedulerInput): SchedulerOutput {
  const { topics, prepDays, startDate, hoursPerDay } = input;

  const sortedTopics = [...topics].sort((a, b) => {
    const aPriority = priorityOrder[a.priority] ?? 99;
    const bPriority = priorityOrder[b.priority] ?? 99;
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    return b.estimatedHours - a.estimatedHours;
  });

  const dailySchedule: DailyScheduleItem[] = [];
  let topicIndex = 0;
  const firstTopic = sortedTopics[0];
  let remainingHoursInTopic = firstTopic ? firstTopic.estimatedHours : 0;

  for (let day = 1; day <= prepDays; day++) {
    const currentDate = addDays(startDate, day - 1);
    const dayHours = hoursPerDay;
    const dayTopics: string[] = [];
    let hoursAllocated = 0;
    let focus = '';
    let deliverable = '';

    while (hoursAllocated < dayHours && topicIndex < sortedTopics.length) {
      const topic = sortedTopics[topicIndex];
      if (!topic) break;
      const hoursForTopic = Math.min(remainingHoursInTopic, dayHours - hoursAllocated);

      dayTopics.push(topic.id);
      hoursAllocated += hoursForTopic;
      remainingHoursInTopic -= hoursForTopic;

      if (!focus) {
        focus = topic.title;
        deliverable = `Complete ${topic.title}`;
      }

      if (remainingHoursInTopic <= 0) {
        topicIndex++;
        if (topicIndex < sortedTopics.length) {
          const nextTopic = sortedTopics[topicIndex];
          if (nextTopic) {
            remainingHoursInTopic = nextTopic.estimatedHours;
          }
        }
      }
    }

    if (dayTopics.length === 0) {
      focus = 'Review & Practice';
      deliverable = 'Mock interview / flashcard review';
      dayTopics.push('review');
      hoursAllocated = Math.min(2, dayHours);
    }

    dailySchedule.push({
      day,
      date: formatDate(currentDate),
      topics: dayTopics,
      hoursAllocated,
      focus,
      deliverable,
    });
  }

  const totalHours = dailySchedule.reduce((sum, d) => sum + d.hoursAllocated, 0);

  return { dailySchedule, totalHours };
}

export function validateSchedule(
  schedule: DailyScheduleItem[],
  prepDays: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (schedule.length !== prepDays) {
    errors.push(`Schedule has ${schedule.length} days, expected ${prepDays}`);
  }

  const days = new Set<number>();
  for (const item of schedule) {
    if (days.has(item.day)) {
      errors.push(`Duplicate day ${item.day}`);
    }
    days.add(item.day);
    if (item.day < 1 || item.day > prepDays) {
      errors.push(`Day ${item.day} out of range 1-${prepDays}`);
    }
    if (item.hoursAllocated <= 0) {
      errors.push(`Day ${item.day} has non-positive hours`);
    }
  }

  for (let d = 1; d <= prepDays; d++) {
    if (!days.has(d)) {
      errors.push(`Missing day ${d}`);
    }
  }

  return { valid: errors.length === 0, errors };
}