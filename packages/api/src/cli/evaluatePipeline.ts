import {
  PipelineInput,
  Kit,
  validateKit,
  validateKitReferences,
  SourceSchema,
  CompanyBriefSchema,
  RoleSchema,
  RequirementSchema,
  QuestionSchema,
  FlashcardSchema,
  ScheduleSchema,
  CoverageSchema,
} from '@interview-prep/shared';
import { runPipeline, createPipelineInput, buildKitFromContext } from '@interview-prep/shared/pipeline';
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
      { name: 'extract-source', execute: extractSource },
      { name: 'extract-company-brief', execute: extractCompanyBrief },
      { name: 'extract-role', execute: extractRole },
      { name: 'extract-requirements', execute: extractRequirements },
      { name: 'generate-questions', execute: generateQuestions },
      { name: 'generate-flashcards', execute: generateFlashcards },
      { name: 'generate-schedule', execute: generateScheduleStep },
      { name: 'compute-coverage', execute: computeCoverage },
    ],
    validateOutput: validateFinalOutput,
  }, createPipelineInput({
    jobDescription: input.jobDescription,
    companyUrl: input.companyUrl,
    daysAvailable: input.prepDays,
    userId: input.userId,
  }));

  const kit = buildKitFromContext(context);
  const refValidation = validateKitReferences(kit);
  if (!refValidation.valid) {
    errors.push(...refValidation.errors);
  }

  const validation = validateKit(kit);
  if (!validation.success) {
    errors.push(...validation.errors.errors.map((e) => `${e.path.join('.')}: ${e.message}`));
  }

  const covered = kit.requirements.filter(r => kit.questions.some(q => q.requirement_ids.includes(r.id))).length;
  const total = kit.requirements.length || 1;
  const coverageScore = covered / total;

  return { kit, coverageScore, errors };
}

async function extractSource(context: { jobDescription: string; companyUrl: string; intermediate: Record<string, unknown> }): Promise<Partial<typeof context>> {
  const source = {
    company: extractCompanyName(context.companyUrl),
    company_url: context.companyUrl,
    role: extractRoleTitle(context.jobDescription),
    location: 'Remote',
    jd_chars: context.jobDescription.length,
    researched_at: new Date().toISOString(),
    pages_used: [context.companyUrl],
  };
  const result = SourceSchema.safeParse(source);
  if (!result.success) throw new Error(`Source validation failed: ${result.error.message}`);
  return { intermediate: { ...context.intermediate, source: result.data } };
}

async function extractCompanyBrief(context: { jobDescription: string; companyUrl: string; intermediate: Record<string, unknown> }): Promise<Partial<typeof context>> {
  const brief = {
    summary: '',
    what_they_do: '',
    sources: [context.companyUrl],
  };
  const result = CompanyBriefSchema.safeParse(brief);
  if (!result.success) throw new Error(`CompanyBrief validation failed: ${result.error.message}`);
  return { intermediate: { ...context.intermediate, company_brief: result.data } };
}

async function extractRole(context: { jobDescription: string; intermediate: Record<string, unknown> }): Promise<Partial<typeof context>> {
  const role = {
    title: extractRoleTitle(context.jobDescription),
    seniority: extractSeniority(context.jobDescription),
    responsibilities: [],
    requirements: [],
  };
  const result = RoleSchema.safeParse(role);
  if (!result.success) throw new Error(`Role validation failed: ${result.error.message}`);
  return { intermediate: { ...context.intermediate, role: result.data } };
}

async function extractRequirements(context: { jobDescription: string; intermediate: Record<string, unknown> }): Promise<Partial<typeof context>> {
  const requirements = parseRequirements(context.jobDescription);
  const validated = requirements.map(r => RequirementSchema.parse(r));
  return { intermediate: { ...context.intermediate, requirements: validated } };
}

async function generateQuestions(context: { requirements: Requirement[]; intermediate: Record<string, unknown> }): Promise<Partial<typeof context>> {
  const questions = generateQuestionsFromRequirements(context.requirements);
  const validated = questions.map(q => QuestionSchema.parse(q));
  return { intermediate: { ...context.intermediate, questions: validated } };
}

async function generateFlashcards(context: { requirements: Requirement[]; questions: Question[]; intermediate: Record<string, unknown> }): Promise<Partial<typeof context>> {
  const flashcards = generateFlashcardsFromRequirements(context.requirements);
  const validated = flashcards.map(f => FlashcardSchema.parse(f));
  return { intermediate: { ...context.intermediate, flashcards: validated } };
}

async function generateScheduleStep(context: { requirements: Requirement[]; questions: Question[]; daysAvailable: number; intermediate: Record<string, unknown> }): Promise<Partial<typeof context>> {
  const { schedule } = generateSchedule({
    requirements: context.requirements,
    questions: context.questions,
    daysAvailable: context.daysAvailable,
    minutesPerDay: 180,
  });
  const validated = ScheduleSchema.parse(schedule);
  return { intermediate: { ...context.intermediate, schedule: validated } };
}

async function computeCoverage(context: { requirements: Requirement[]; questions: Question[]; schedule: { days: { question_ids: string[] }[] }; intermediate: Record<string, unknown> }): Promise<Partial<typeof context>> {
  const reqIds = new Set(context.requirements.map(r => r.id));
  const coveredReqIds = new Set(context.questions.flatMap(q => q.requirement_ids));
  const uncovered = Array.from(reqIds).filter(id => !coveredReqIds.has(id));

  const coverage = {
    uncovered_requirement_ids: uncovered,
    passes: 1,
  };
  const validated = CoverageSchema.parse(coverage);
  return { intermediate: { ...context.intermediate, coverage: validated } };
}

function validateFinalOutput(context: { intermediate: Record<string, unknown> }): { valid: boolean; errors: string[] } {
  const required = ['source', 'company_brief', 'role', 'requirements', 'questions', 'flashcards', 'schedule', 'coverage'];
  const errors: string[] = [];

  for (const field of required) {
    if (!context.intermediate[field]) {
      errors.push(`Missing ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function extractCompanyName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace('www.', '').split('.')[0];
  } catch {
    return 'Company';
  }
}

function extractRoleTitle(jd: string): string {
  const lines = jd.split('\n').slice(0, 10);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('engineer') || lower.includes('developer') || lower.includes('scientist') || lower.includes('manager')) {
      return line.trim();
    }
  }
  return 'Software Engineer';
}

function extractSeniority(jd: string): string {
  const lower = jd.toLowerCase();
  if (lower.includes('senior') || lower.includes('lead') || lower.includes('principal') || lower.includes('staff')) return 'Senior';
  if (lower.includes('junior') || lower.includes('entry') || lower.includes('graduate')) return 'Junior';
  return 'Mid';
}

function parseRequirements(jd: string): Array<{ id: string; text: string; kind: 'technical' | 'behavioural' | 'domain'; priority: 'must' | 'nice' }> {
  const requirements: Array<{ id: string; text: string; kind: 'technical' | 'behavioural' | 'domain'; priority: 'must' | 'nice' }> = [];
  const lines = jd.split('\n');
  let id = 1;

  const techKeywords = ['javascript', 'typescript', 'react', 'node', 'python', 'java', 'go', 'rust', 'sql', 'aws', 'docker', 'kubernetes', 'system design', 'architecture', 'api', 'database'];
  const behaviouralKeywords = ['communication', 'team', 'collaborat', 'leadership', 'mentor', 'stakeholder', 'agile', 'scrum'];
  const domainKeywords = ['fintech', 'healthcare', 'ecommerce', 'security', 'compliance', 'ml', 'ai', 'data'];

  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-*•\d.]\s*/, '');
    if (trimmed.length < 10) continue;

    const lower = trimmed.toLowerCase();
    let kind: 'technical' | 'behavioural' | 'domain' = 'technical';
    let priority: 'must' | 'nice' = 'must';

    if (behaviouralKeywords.some(k => lower.includes(k))) kind = 'behavioural';
    else if (domainKeywords.some(k => lower.includes(k))) kind = 'domain';
    else if (!techKeywords.some(k => lower.includes(k))) kind = 'domain';

    if (lower.includes('nice to have') || lower.includes('preferred') || lower.includes('bonus')) priority = 'nice';

    requirements.push({
      id: `req-${id++}`,
      text: trimmed,
      kind,
      priority,
    });

    if (requirements.length >= 15) break;
  }

  if (requirements.length === 0) {
    requirements.push(
      { id: 'req-1', text: 'Proficiency in relevant programming languages', kind: 'technical', priority: 'must' },
      { id: 'req-2', text: 'Strong problem-solving skills', kind: 'technical', priority: 'must' },
      { id: 'req-3', text: 'Effective communication', kind: 'behavioural', priority: 'must' },
    );
  }

  return requirements;
}

function generateQuestionsFromRequirements(requirements: Array<{ id: string; kind: 'technical' | 'behavioural' | 'domain'; priority: 'must' | 'nice' }>): Array<{ id: string; requirement_ids: string[]; category: 'technical' | 'behavioural' | 'system-design' | 'company-fit'; prompt: string; answer_outline: string; difficulty: 1 | 2 | 3 }> {
  const questions: Array<{ id: string; requirement_ids: string[]; category: 'technical' | 'behavioural' | 'system-design' | 'company-fit'; prompt: string; answer_outline: string; difficulty: 1 | 2 | 3 }> = [];
  let qId = 1;

  for (const req of requirements) {
    const categoryMap: Record<string, 'technical' | 'behavioural' | 'system-design' | 'company-fit'> = {
      technical: 'technical',
      behavioural: 'behavioural',
      domain: 'company-fit',
    };

    const difficultyMap: Record<string, 1 | 2 | 3> = {
      must: 2,
      nice: 1,
    };

    questions.push({
      id: `q-${qId++}`,
      requirement_ids: [req.id],
      category: categoryMap[req.kind] || 'technical',
      prompt: `Explain your experience with: ${req.text}`,
      answer_outline: 'Use STAR method: Situation, Task, Action, Result',
      difficulty: difficultyMap[req.priority],
    });
  }

  if (requirements.some(r => r.kind === 'technical')) {
    questions.push({
      id: `q-${qId++}`,
      requirement_ids: requirements.filter(r => r.kind === 'technical').map(r => r.id),
      category: 'system-design',
      prompt: 'Design a scalable system for the core product described in the job',
      answer_outline: 'Requirements -> API -> Data model -> Scale -> Trade-offs',
      difficulty: 3,
    });
  }

  return questions;
}

function generateFlashcardsFromRequirements(requirements: Array<{ id: string; text: string }>): Array<{ id: string; front: string; back: string; requirement_ids: string[] }> {
  return requirements.slice(0, 10).map((req, i) => ({
    id: `fc-${i + 1}`,
    front: req.text,
    back: `Key points for: ${req.text}`,
    requirement_ids: [req.id],
  }));
}