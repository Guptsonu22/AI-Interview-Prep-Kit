import { z } from 'zod';

export const ContentStateSchema = z.enum(['generated', 'edited', 'pinned']);
export type ContentState = z.infer<typeof ContentStateSchema>;

export const CompanyProfileSchema = z.object({
  name: z.string(),
  website: z.string().url(),
  industry: z.string(),
  size: z.string(),
  mission: z.string().optional(),
  values: z.array(z.string()).optional(),
  techStack: z.array(z.string()).optional(),
  hiringPageUrl: z.string().url().optional(),
  cultureSignals: z.array(z.string()).optional(),
  recentNews: z.array(z.string()).optional(),
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

export const JobRequirementSchema = z.object({
  id: z.string(),
  category: z.enum(['technical', 'behavioral', 'domain', 'soft-skill', 'experience']),
  description: z.string(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  source: z.enum(['job-description', 'company-research', 'interview-reports']),
  evidence: z.string().optional(),
});
export type JobRequirement = z.infer<typeof JobRequirementSchema>;

export const InterviewFormatSchema = z.object({
  type: z.enum(['phone-screen', 'technical-phone', 'onsite', 'virtual-onsite', 'take-home', 'system-design', 'behavioral', 'values-fit']),
  durationMinutes: z.number().int().positive(),
  description: z.string(),
  typicalQuestions: z.array(z.string()).optional(),
  evaluationCriteria: z.array(z.string()).optional(),
});
export type InterviewFormat = z.infer<typeof InterviewFormatSchema>;

export const InterviewExperienceSchema = z.object({
  source: z.string(),
  role: z.string(),
  date: z.string().optional(),
  format: z.array(z.string()),
  questions: z.array(z.string()),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  outcome: z.enum(['offer', 'rejected', 'withdrawn', 'pending']).optional(),
  tips: z.array(z.string()).optional(),
});
export type InterviewExperience = z.infer<typeof InterviewExperienceSchema>;

export const StudyTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.enum(['technical', 'behavioral', 'system-design', 'domain', 'company-specific']),
  estimatedHours: z.number().positive(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  resources: z.array(z.object({
    title: z.string(),
    url: z.string().url().optional(),
    type: z.enum(['article', 'video', 'course', 'documentation', 'practice']),
  })).optional(),
  requirementsCovered: z.array(z.string()).optional(),
});
export type StudyTopic = z.infer<typeof StudyTopicSchema>;

export const DailyScheduleItemSchema = z.object({
  day: z.number().int().positive(),
  date: z.string(),
  topics: z.array(z.string()),
  hoursAllocated: z.number().positive(),
  focus: z.string(),
  deliverable: z.string().optional(),
});
export type DailyScheduleItem = z.infer<typeof DailyScheduleItemSchema>;

export const FlashcardSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  tags: z.array(z.string()),
  category: z.enum(['technical', 'behavioral', 'system-design', 'domain', 'company-specific']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  sourceRequirementId: z.string().optional(),
});
export type Flashcard = z.infer<typeof FlashcardSchema>;

export const KitMetadataSchema = z.object({
  generatedAt: z.string().datetime(),
  pipelineVersion: z.string(),
  jobDescriptionHash: z.string(),
  companyUrl: z.string().url(),
  prepDaysRequested: z.number().int().positive(),
  totalEstimatedHours: z.number().positive(),
  requirementsCount: z.number().int().nonnegative(),
  coverageScore: z.number().min(0).max(1),
});
export type KitMetadata = z.infer<typeof KitMetadataSchema>;

export const KitSchema = z.object({
  id: z.string(),
  userId: z.string(),
  jobDescription: z.string(),
  companyUrl: z.string().url(),
  prepDays: z.number().int().positive(),
  companyProfile: CompanyProfileSchema,
  requirements: z.array(JobRequirementSchema),
  interviewFormats: z.array(InterviewFormatSchema),
  interviewExperiences: z.array(InterviewExperienceSchema),
  studyTopics: z.array(StudyTopicSchema),
  dailySchedule: z.array(DailyScheduleItemSchema),
  flashcards: z.array(FlashcardSchema),
  metadata: KitMetadataSchema,
  contentStates: z.record(ContentStateSchema).optional(),
  status: z.enum(['draft', 'generating', 'ready', 'archived']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Kit = z.infer<typeof KitSchema>;

export const PipelineInputSchema = z.object({
  jobDescription: z.string().min(100),
  companyUrl: z.string().url(),
  prepDays: z.number().int().positive().max(90),
  userId: z.string(),
});
export type PipelineInput = z.infer<typeof PipelineInputSchema>;

export const PipelineStepResultSchema = z.object({
  step: z.string(),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
});
export type PipelineStepResult = z.infer<typeof PipelineStepResultSchema>;

export const ContentStateMapSchema = z.record(ContentStateSchema);
export type ContentStateMap = z.infer<typeof ContentStateMapSchema>;

export function validateKit(kit: unknown): { success: true; data: Kit } | { success: false; errors: z.ZodError } {
  const result = KitSchema.safeParse(kit);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

export function checkCoverage(kit: Kit): { covered: string[]; missing: string[] } {
  const requiredFields = [
    'companyProfile',
    'requirements',
    'interviewFormats',
    'interviewExperiences',
    'studyTopics',
    'dailySchedule',
    'flashcards',
    'metadata',
  ] as const;

  const covered: string[] = [];
  const missing: string[] = [];

  for (const field of requiredFields) {
    const value = kit[field];
    if (Array.isArray(value) && value.length === 0) {
      missing.push(field);
    } else if (value === undefined || value === null || (typeof value === 'object' && Object.keys(value).length === 0)) {
      missing.push(field);
    } else {
      covered.push(field);
    }
  }

  return { covered, missing };
}

export function createEmptyContentStates(kit: Kit): ContentStateMap {
  const states: ContentStateMap = {};
  const fields: (keyof Kit)[] = [
    'companyProfile',
    'requirements',
    'interviewFormats',
    'interviewExperiences',
    'studyTopics',
    'dailySchedule',
    'flashcards',
  ];

  for (const field of fields) {
    states[field] = 'generated';
  }
  return states;
}

export function applyContentEdit(
  kit: Kit,
  fieldPath: string,
  newValue: unknown
): { kit: Kit; contentStates: ContentStateMap } {
  const updatedKit = JSON.parse(JSON.stringify(kit));
  const contentStates = { ...(kit.contentStates || createEmptyContentStates(kit)) };

  const keys = fieldPath.split('.');
  if (keys.length === 0) return { kit: updatedKit as Kit, contentStates };
  let current: Record<string, unknown> | undefined = updatedKit as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current) break;
    const key = keys[i];
    if (!key) continue;
    if (key in current) {
      const next = current[key];
      if (next && typeof next === 'object' && !Array.isArray(next)) {
        current = next as Record<string, unknown>;
      } else {
        current = undefined;
        break;
      }
    } else {
      current = undefined;
      break;
    }
  }
  if (current) {
    const lastKey = keys[keys.length - 1];
    if (lastKey && lastKey in current) {
      current[lastKey] = newValue;
    }
  }

  contentStates[fieldPath] = 'edited';
  updatedKit.contentStates = contentStates;
  updatedKit.updatedAt = new Date().toISOString();

  return { kit: updatedKit as Kit, contentStates };
}

export function pinContent(kit: Kit, fieldPath: string): { kit: Kit; contentStates: ContentStateMap } {
  const contentStates = { ...(kit.contentStates || createEmptyContentStates(kit)) };
  if (fieldPath in contentStates) {
    contentStates[fieldPath] = 'pinned';
  }
  const updatedKit = { ...kit, contentStates, updatedAt: new Date().toISOString() };
  return { kit: updatedKit, contentStates };
}