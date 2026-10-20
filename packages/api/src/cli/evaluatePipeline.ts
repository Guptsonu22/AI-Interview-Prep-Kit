import { PipelineInput, Kit, validateKit, checkCoverage, createEmptyContentStates } from '@interview-prep/shared';
import { runPipeline } from '@interview-prep/shared/pipeline';
import { generateSchedule } from '@interview-prep/shared/scheduler';

export interface EvaluationResult {
  kit: Kit;
  coverageScore: number;
  errors: string[];
}

export async function runEvaluationPipeline(input: PipelineInput): Promise<EvaluationResult> {
  const errors: string[] = [];

  const context = await runPipeline({
    steps: [
      { name: 'extract-requirements', execute: extractRequirements },
      { name: 'crawl-company', execute: crawlCompany },
      { name: 'research-interviews', execute: researchInterviews },
      { name: 'synthesize-kit', execute: synthesizeKit },
      { name: 'validate-coverage', execute: validateCoverage },
      { name: 'gap-fill', execute: gapFill },
      { name: 'generate-schedule', execute: generateScheduleStep },
      { name: 'generate-flashcards', execute: generateFlashcards },
    ],
    validateOutput: validateFinalOutput,
  }, {
    jobDescription: input.jobDescription,
    companyUrl: input.companyUrl,
    prepDays: input.prepDays,
    userId: input.userId,
    intermediate: {},
  });

  const kit = context.intermediate['kit'] as Kit;
  const coverage = checkCoverage(kit);
  const coverageScore = coverage.covered.length / (coverage.covered.length + coverage.missing.length || 1);

  if (!kit.contentStates) {
    kit.contentStates = createEmptyContentStates(kit);
  }

  const validation = validateKit(kit);
  if (!validation.success) {
    errors.push(...validation.errors.errors.map((e) => `${e.path.join('.')}: ${e.message}`));
  }

  return { kit, coverageScore, errors };
}

async function extractRequirements(context: { jobDescription: string; intermediate: Record<string, unknown> }): Promise<Partial<typeof context>> {
  const requirements = [
    { id: 'req-1', category: 'technical', description: 'Extracted from job description', priority: 'high', source: 'job-description' as const, evidence: '' },
    { id: 'req-2', category: 'behavioral', description: 'Team collaboration', priority: 'medium', source: 'job-description' as const, evidence: '' },
  ];
  return { intermediate: { ...context.intermediate, requirements } };
}

async function crawlCompany(context: { companyUrl: string; intermediate: Record<string, unknown> }): Promise<Partial<typeof context>> {
  const companyProfile = {
    name: 'Company',
    website: context.companyUrl,
    industry: 'Technology',
    size: '100-500',
    mission: 'Build great products',
    values: ['Innovation', 'Customer focus'],
    techStack: ['TypeScript', 'React', 'Node.js'],
    hiringPageUrl: `${context.companyUrl}/careers`,
    cultureSignals: ['Remote-first', 'Learning culture'],
    recentNews: ['Series B funding'],
  };
  return { intermediate: { ...context.intermediate, companyProfile } };
}

async function researchInterviews(context: { companyUrl: string; intermediate: Record<string, unknown> }): Promise<Partial<typeof context>> {
  const interviewExperiences = [
    { source: 'Glassdoor', role: 'Software Engineer', date: '2024-01', format: ['technical-phone', 'onsite'], questions: ['System design', 'Behavioral'], difficulty: 'medium', outcome: 'offer', tips: ['Prepare STAR stories'] },
    { source: 'Reddit', role: 'Frontend Engineer', date: '2024-02', format: ['take-home', 'virtual-onsite'], questions: ['React patterns', 'CSS'], difficulty: 'easy', outcome: 'pending', tips: ['Focus on accessibility'] },
  ];
  return { intermediate: { ...context.intermediate, interviewExperiences } };
}

async function synthesizeKit(context: { intermediate: Record<string, unknown>; prepDays: number; jobDescription: string }): Promise<Partial<typeof context>> {
  const { requirements, companyProfile, interviewExperiences } = context.intermediate;

  const interviewFormats = [
    { type: 'technical-phone', durationMinutes: 60, description: 'Technical phone screen', typicalQuestions: [], evaluationCriteria: [] },
    { type: 'onsite', durationMinutes: 300, description: 'Onsite loop', typicalQuestions: [], evaluationCriteria: [] },
  ];

  const studyTopics = [
    { id: 'topic-1', title: 'System Design Fundamentals', description: 'Scalability, consistency, partitioning', category: 'system-design', estimatedHours: 8, priority: 'high', resources: [], requirementsCovered: ['req-1'] },
    { id: 'topic-2', title: 'Behavioral Interview Prep', description: 'STAR method, leadership principles', category: 'behavioral', estimatedHours: 4, priority: 'high', resources: [], requirementsCovered: ['req-2'] },
    { id: 'topic-3', title: 'Company-Specific Research', description: 'Products, culture, recent news', category: 'company-specific', estimatedHours: 3, priority: 'medium', resources: [], requirementsCovered: [] },
  ];

  return { intermediate: { ...context.intermediate, interviewFormats, studyTopics } };
}

async function validateCoverage(context: { intermediate: Record<string, unknown> }): Promise<Partial<typeof context>> {
  return { intermediate: { ...context.intermediate, coverage: { covered: [], missing: [] } } };
}

async function gapFill(context: { intermediate: Record<string, unknown> }): Promise<Partial<typeof context>> {
  return { intermediate: context.intermediate };
}

async function generateScheduleStep(context: { intermediate: Record<string, unknown>; prepDays: number }): Promise<Partial<typeof context>> {
  const { studyTopics } = context.intermediate;
  const { dailySchedule } = generateSchedule({
    topics: studyTopics as Parameters<typeof generateSchedule>[0]['topics'],
    prepDays: context.prepDays,
    startDate: new Date(),
    hoursPerDay: 3,
  });
  return { intermediate: { ...context.intermediate, dailySchedule } };
}

async function generateFlashcards(context: { intermediate: Record<string, unknown> }): Promise<Partial<typeof context>> {
  const flashcards = [
    { id: 'fc-1', question: 'What is CAP theorem?', answer: 'Consistency, Availability, Partition tolerance - pick 2', tags: ['system-design'], category: 'system-design', difficulty: 'medium', sourceRequirementId: 'req-1' },
    { id: 'fc-2', question: 'Describe a conflict you resolved', answer: 'STAR: Situation, Task, Action, Result', tags: ['behavioral'], category: 'behavioral', difficulty: 'easy', sourceRequirementId: 'req-2' },
  ];
  return { intermediate: { ...context.intermediate, flashcards } };
}

function validateFinalOutput(context: { intermediate: Record<string, unknown> }): { valid: boolean; errors: string[] } {
  const { companyProfile, requirements, interviewFormats, interviewExperiences, studyTopics, dailySchedule, flashcards } = context.intermediate;
  const errors: string[] = [];

  if (!companyProfile) errors.push('Missing companyProfile');
  if (!requirements || (requirements as unknown[]).length === 0) errors.push('Missing requirements');
  if (!interviewFormats || (interviewFormats as unknown[]).length === 0) errors.push('Missing interviewFormats');
  if (!studyTopics || (studyTopics as unknown[]).length === 0) errors.push('Missing studyTopics');
  if (!dailySchedule || (dailySchedule as unknown[]).length === 0) errors.push('Missing dailySchedule');
  if (!flashcards || (flashcards as unknown[]).length === 0) errors.push('Missing flashcards');

  return { valid: errors.length === 0, errors };
}