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
export declare function generateSchedule(input: SchedulerInput): SchedulerOutput;
export declare function validateSchedule(schedule: DailyScheduleItem[], prepDays: number): {
    valid: boolean;
    errors: string[];
};
//# sourceMappingURL=index.d.ts.map