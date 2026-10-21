import { z } from 'zod';

export const SourceSchema = z.object({
  company: z.string().min(1),
  company_url: z.string().url(),
  role: z.string().min(1),
  location: z.string().min(1),
  jd_chars: z.number().int().nonnegative(),
  researched_at: z.string().datetime(),
  pages_used: z.array(z.string().url()).default([]),
});
export type Source = z.infer<typeof SourceSchema>;

export const CompanyBriefSchema = z.object({
  summary: z.string().default(''),
  what_they_do: z.string().default(''),
  sources: z.array(z.string().url()).default([]),
});
export type CompanyBrief = z.infer<typeof CompanyBriefSchema>;

export const RoleSchema = z.object({
  title: z.string().min(1),
  seniority: z.string().default(''),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
});
export type Role = z.infer<typeof RoleSchema>;

export const RequirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: z.enum(['technical', 'behavioural', 'domain']),
  priority: z.enum(['must', 'nice']),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const QuestionSchema = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string().min(1)).default([]),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']),
  prompt: z.string().min(1),
  answer_outline: z.string().default(''),
  difficulty: z.number().int().min(1).max(3),
  provenance: z.enum(['generated', 'user_created']).default('generated').optional(),
  edited: z.boolean().default(false).optional(),
  pinned: z.boolean().default(false).optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

export const FlashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string().min(1)).default([]),
  provenance: z.enum(['generated', 'user_created']).default('generated').optional(),
  edited: z.boolean().default(false).optional(),
  pinned: z.boolean().default(false).optional(),
});
export type Flashcard = z.infer<typeof FlashcardSchema>;

export const DaySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string().min(1),
  question_ids: z.array(z.string().min(1)).default([]),
  minutes: z.number().int().positive(),
});
export type Day = z.infer<typeof DaySchema>;

export const ScheduleSchema = z.object({
  days_available: z.number().int().positive(),
  days: z.array(DaySchema).default([]),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export const CoverageSchema = z.object({
  uncovered_requirement_ids: z.array(z.string().min(1)).default([]),
  passes: z.number().int().nonnegative(),
  gap_analysis: z.string().optional(),
});
export type Coverage = z.infer<typeof CoverageSchema>;

export const KitSchema = z.object({
  source: SourceSchema,
  company_brief: CompanyBriefSchema,
  role: RoleSchema,
  requirements: z.array(RequirementSchema).default([]),
  questions: z.array(QuestionSchema).default([]),
  flashcards: z.array(FlashcardSchema).default([]),
  schedule: ScheduleSchema,
  coverage: CoverageSchema,
});
export type Kit = z.infer<typeof KitSchema>;

export const PipelineInputSchema = z.object({
  jobDescription: z.string().min(100),
  companyUrl: z.string().url(),
  daysAvailable: z.number().int().positive().max(90),
  userId: z.string().min(1),
});
export type PipelineInput = z.infer<typeof PipelineInputSchema>;

export const BatchCaseSchema = z.object({
  case_id: z.string().min(1),
  jobDescription: z.string().min(100),
  companyUrl: z.string().url(),
  daysAvailable: z.number().int().positive().max(90),
});
export type BatchCase = z.infer<typeof BatchCaseSchema>;

export const BatchOutputSchema = z.object({
  case_id: z.string(),
  status: z.enum(['ok', 'error']),
  kit: KitSchema.optional(),
  error: z.string().optional(),
});
export type BatchOutput = z.infer<typeof BatchOutputSchema>;

export function validateKit(kit: unknown): { success: true; data: Kit } | { success: false; errors: z.ZodError } {
  const result = KitSchema.safeParse(kit);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

export function validateBatchInput(input: unknown): { success: true; data: BatchCase[] } | { success: false; errors: z.ZodError } {
  const result = z.array(BatchCaseSchema).safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

export function validateKitReferences(kit: Kit): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const reqIds = new Set(kit.requirements.map(r => r.id));
  const qIds = new Set(kit.questions.map(q => q.id));

  for (const q of kit.questions) {
    for (const reqId of q.requirement_ids) {
      if (!reqIds.has(reqId)) {
        errors.push(`Question ${q.id} references non-existent requirement ${reqId}`);
      }
    }
  }

  for (const day of kit.schedule.days) {
    for (const qId of day.question_ids) {
      if (!qIds.has(qId)) {
        errors.push(`Day ${day.day} references non-existent question ${qId}`);
      }
    }
  }

  for (const f of kit.flashcards) {
    for (const reqId of f.requirement_ids) {
      if (!reqIds.has(reqId)) {
        errors.push(`Flashcard ${f.id} references non-existent requirement ${reqId}`);
      }
    }
  }

  const scheduledQIds = new Set(kit.schedule.days.flatMap(d => d.question_ids));
  for (const q of kit.questions) {
    if (!scheduledQIds.has(q.id)) {
      errors.push(`Question ${q.id} is not scheduled`);
    }
  }

  if (kit.schedule.days.length !== kit.schedule.days_available) {
    errors.push(`Schedule has ${kit.schedule.days.length} days but days_available is ${kit.schedule.days_available}`);
  }

  const dayNumbers = kit.schedule.days.map(d => d.day).sort((a, b) => a - b);
  for (let i = 0; i < dayNumbers.length; i++) {
    if (dayNumbers[i] !== i + 1) {
      errors.push(`Schedule days must be consecutive starting from 1, found gap at day ${i + 1}`);
    }
  }

  return { valid: errors.length === 0, errors };
}