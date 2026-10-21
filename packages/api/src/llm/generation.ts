/**
 * LLM Generation Functions
 *
 * All seven generation steps are implemented here as pure async functions.
 * Each step:
 *   - Accepts only the data it needs (minimal context, no full objects passed through)
 *   - Builds a concise, focused prompt (external text is wrapped and labelled
 *     to prevent prompt-injection – it is never interpolated directly into
 *     instructions)
 *   - Uses JSON mode where supported
 *   - Validates the response with validateAndNormalizeGeneratedContent
 *   - Throws a typed error on permanent validation failure so callers can
 *     decide whether to retry with a modified request
 *   - Caches results keyed on the relevant inputs
 *
 * Provider selection, retries, and concurrency are handled by the LLMClient.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SECURITY NOTE
 * All job-description and company-evidence text is passed inside clearly
 * delimited DATA blocks so the model distinguishes untrusted user content
 * from our instructions.  The delimiters are chosen to be unlikely to appear
 * in normal JD text.
 * ────────────────────────────────────────────────────────────────────────────
 */

import pino from 'pino';
import { LLMCache, withCache } from './cache';
import { validateAndNormalizeGeneratedContent } from './validate';
import { schemaExample } from './schemas';
import type { LLMClient } from './client';
import type {
  ExtractedRequirement,
  RoleMetadata,
  GeneratedQuestion,
  GeneratedFlashcard,
  GeneratedCompanyBrief,
} from './types';
import type {
  RequirementsOutput,
  RoleMetadataOutput,
  CompanyBriefOutput,
  QuestionsOutput,
  FlashcardsOutput,
} from './schemas';

const logger = pino({ name: 'llm-generation' });

/** Wraps untrusted text in a safe data block to prevent prompt injection */
function dataBlock(label: string, content: string): string {
  return `\n<<<DATA:${label}>>>\n${content}\n<<<END:${label}>>>\n`;
}

/** Generates a short slug suitable for IDs */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30);
}

/** Throw this for non-retryable validation failures */
export class GenerationValidationError extends Error {
  constructor(
    public readonly step: string,
    public readonly validationErrors: string[]
  ) {
    super(`Generation validation failed for step "${step}": ${validationErrors.join('; ')}`);
    this.name = 'GenerationValidationError';
  }
}

// ---------------------------------------------------------------------------
// Shared caches
// ---------------------------------------------------------------------------

const requirementsCache = new LLMCache<RequirementsOutput>();
const roleCache = new LLMCache<RoleMetadataOutput>();
const companyBriefCache = new LLMCache<CompanyBriefOutput>();
const questionsCache = new LLMCache<QuestionsOutput>();
const flashcardsCache = new LLMCache<FlashcardsOutput>();

// ---------------------------------------------------------------------------
// 1. extractJobRequirements
// ---------------------------------------------------------------------------

/**
 * Identifies requirements from a job description.
 *
 * Each requirement receives a stable ID (req_<slug>), is classified as
 * technical / behavioural / domain, and is marked must / nice based on
 * the wording ("required", "must", "strong nice-to-have", etc.).
 * A source excerpt from the original JD ensures traceability.
 *
 * Requirements absent from the posting are never invented.
 */
export async function extractJobRequirements(
  jd: string,
  client: LLMClient
): Promise<ExtractedRequirement[]> {
  const key = LLMCache.key('extractJobRequirements', jd);
  const cached = requirementsCache.get(key);
  if (cached) {
    logger.debug('extractJobRequirements: cache hit');
    return cached.requirements as ExtractedRequirement[];
  }

  const system = `You are a precise job-description analyst. Extract every distinct requirement from the job description provided in the DATA block. Do NOT invent requirements absent from the text.

Rules:
- kind: "technical" (hard skills, tools, languages), "behavioural" (soft skills, collaboration, communication, leadership), "domain" (industry knowledge).
- priority: "must" when the JD uses words like "required", "must", "essential", "minimum"; otherwise "nice".
- id: stable slug prefixed with req_, e.g. req_typescript. Use unique IDs.
- source_excerpt: verbatim quote (≤ 300 chars) from the JD that grounds this requirement.
- text: concise, one-sentence description (≤ 500 chars).
- Output ONLY valid JSON matching the schema below. Do not include commentary.

Expected JSON schema:
${schemaExample('requirements')}`;

  const userMsg = `Extract all requirements from the following job description.${dataBlock('JOB_DESCRIPTION', jd)}`;

  const response = await client.call([{ role: 'user', content: userMsg }], {
    system,
    jsonMode: true,
  });

  const raw = response.json ?? response.text;
  const validation = validateAndNormalizeGeneratedContent<RequirementsOutput>('requirements', raw);

  if (!validation.valid || !validation.data) {
    logger.error({ errors: validation.errors }, 'extractJobRequirements validation failed');
    throw new GenerationValidationError('extractJobRequirements', validation.errors);
  }

  if (validation.normalised.length > 0) {
    logger.warn({ normalised: validation.normalised }, 'extractJobRequirements: auto-normalised fields');
  }

  requirementsCache.set(key, validation.data);
  return validation.data.requirements as ExtractedRequirement[];
}

// ---------------------------------------------------------------------------
// 2. identifyRoleMetadata
// ---------------------------------------------------------------------------

/**
 * Extracts role-level metadata: title, seniority, location, experience,
 * and key responsibilities from the JD.
 *
 * Returns empty strings / empty arrays when information is absent –
 * never invents facts.
 */
export async function identifyRoleMetadata(
  jd: string,
  client: LLMClient
): Promise<RoleMetadata> {
  const key = LLMCache.key('identifyRoleMetadata', jd);
  const cached = roleCache.get(key);
  if (cached) {
    logger.debug('identifyRoleMetadata: cache hit');
    return cached as RoleMetadata;
  }

  const system = `You are a job-description parser. Extract structured role metadata from the DATA block below.

Rules:
- Return empty string "" for fields not mentioned in the JD – never guess.
- responsibilities: up to 10 bullet-point strings, verbatim or closely paraphrased from the JD.
- evidence: verbatim JD excerpts that informed each field (one per field).
- Output ONLY valid JSON. No commentary.

Expected JSON schema:
${schemaExample('role')}`;

  const userMsg = `Extract role metadata from this job description.${dataBlock('JOB_DESCRIPTION', jd)}`;

  const response = await client.call([{ role: 'user', content: userMsg }], {
    system,
    jsonMode: true,
  });

  const raw = response.json ?? response.text;
  const validation = validateAndNormalizeGeneratedContent<RoleMetadataOutput>('role', raw);

  if (!validation.valid || !validation.data) {
    logger.error({ errors: validation.errors }, 'identifyRoleMetadata validation failed');
    throw new GenerationValidationError('identifyRoleMetadata', validation.errors);
  }

  roleCache.set(key, validation.data);
  return validation.data as RoleMetadata;
}

// ---------------------------------------------------------------------------
// 3. generateCompanyBrief
// ---------------------------------------------------------------------------

/**
 * Summarises what the company does from scraped evidence.
 *
 * When evidence is insufficient for a field, that field is listed in
 * unverified_fields and left minimal. No information is invented.
 */
export async function generateCompanyBrief(
  companyEvidence: { text: string; url: string }[],
  client: LLMClient
): Promise<GeneratedCompanyBrief> {
  const key = LLMCache.key('generateCompanyBrief', companyEvidence);
  const cached = companyBriefCache.get(key);
  if (cached) {
    logger.debug('generateCompanyBrief: cache hit');
    return cached as GeneratedCompanyBrief;
  }

  const hasEvidence = companyEvidence.length > 0 && companyEvidence.some((e) => e.text.trim().length > 50);

  if (!hasEvidence) {
    const empty: GeneratedCompanyBrief = {
      summary: '',
      what_they_do: '',
      sources: [],
      unverified_fields: ['summary', 'what_they_do'],
    };
    companyBriefCache.set(key, empty as unknown as CompanyBriefOutput);
    return empty;
  }

  const evidenceBlock = companyEvidence
    .map((e, i) => `[Source ${i + 1}: ${e.url}]\n${e.text.slice(0, 1500)}`)
    .join('\n\n');

  const system = `You are a company researcher. Summarise what the company does using ONLY the evidence provided in the DATA block.

Rules:
- summary: 2-3 sentences about the company overall.
- what_they_do: 1-2 sentences on their core product/service.
- sources: list of source URLs you actually used.
- unverified_fields: list field names you could NOT verify from the evidence.
- NEVER invent facts not present in the evidence.
- Output ONLY valid JSON.

Expected JSON schema:
${schemaExample('company_brief')}`;

  const userMsg = `Summarise the company from the following evidence.${dataBlock('COMPANY_EVIDENCE', evidenceBlock)}`;

  const response = await client.call([{ role: 'user', content: userMsg }], {
    system,
    jsonMode: true,
  });

  const raw = response.json ?? response.text;
  const validation = validateAndNormalizeGeneratedContent<CompanyBriefOutput>('company_brief', raw);

  if (!validation.valid || !validation.data) {
    logger.error({ errors: validation.errors }, 'generateCompanyBrief validation failed');
    throw new GenerationValidationError('generateCompanyBrief', validation.errors);
  }

  companyBriefCache.set(key, validation.data);
  return validation.data as GeneratedCompanyBrief;
}

// ---------------------------------------------------------------------------
// 4. generateQuestionsForRequirement
// ---------------------------------------------------------------------------

/**
 * Generates interview questions for a single requirement.
 *
 * @param requirement  The requirement object (id, text, kind, priority)
 * @param category     The question category to generate
 * @param context      Supporting context: seniority, role title, company brief
 */
export async function generateQuestionsForRequirement(
  requirement: ExtractedRequirement,
  category: 'technical' | 'behavioural' | 'system-design' | 'company-fit',
  context: {
    seniority: string;
    roleTitle: string;
    companyBrief?: string;
    hiringProcess?: string;
  },
  client: LLMClient
): Promise<GeneratedQuestion[]> {
  const key = LLMCache.key('generateQuestionsForRequirement', requirement, category, context);
  const cached = questionsCache.get(key);
  if (cached) {
    logger.debug('generateQuestionsForRequirement: cache hit');
    return cached.questions as GeneratedQuestion[];
  }

  const categoryGuidance: Record<string, string> = {
    technical:
      'Test technical depth and practical application. Avoid generic definitions. Prefer implementation or debugging scenarios.',
    behavioural:
      'Use STAR-style prompts. Focus on evidence of collaboration, leadership, mentoring, or communication drawn from this requirement.',
    'system-design':
      `Design problems appropriate for a ${context.seniority || 'mid-level'} ${context.roleTitle}. Scope to systems relevant to the requirement.`,
    'company-fit':
      context.companyBrief
        ? `Ground in company evidence. Do not invent company details.${dataBlock('COMPANY_BRIEF', context.companyBrief)}`
        : 'Ask about motivation and role alignment. Do not assume specific company details.',
  };

  const system = `You are an expert technical interviewer. Generate 2-4 interview questions of category "${category}" for the requirement below.

Category guidance: ${categoryGuidance[category]}

Rules:
- Each question must reference requirement ID "${requirement.id}".
- Difficulty: 1 (junior), 2 (mid), 3 (senior). Use seniority context.
- Include a thorough answer_outline (hints, not a model answer).
- id format: q_<slug>, e.g. q_${slugify(requirement.text)}_${category.replace('-', '_')}_1
- Output ONLY valid JSON.

Expected JSON schema:
${schemaExample('questions')}`;

  const contextLines = [
    `Role: ${context.roleTitle}`,
    `Seniority: ${context.seniority || 'not specified'}`,
    context.hiringProcess ? `Hiring process note: ${context.hiringProcess}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const userMsg =
    `Generate ${category} questions for the following requirement.\n${contextLines}` +
    dataBlock('REQUIREMENT', `ID: ${requirement.id}\nText: ${requirement.text}\nKind: ${requirement.kind}`);

  const response = await client.call([{ role: 'user', content: userMsg }], {
    system,
    jsonMode: true,
  });

  const raw = response.json ?? response.text;
  const validation = validateAndNormalizeGeneratedContent<QuestionsOutput>('questions', raw);

  if (!validation.valid || !validation.data) {
    logger.error({ errors: validation.errors, requirement: requirement.id }, 'generateQuestionsForRequirement validation failed');
    throw new GenerationValidationError('generateQuestionsForRequirement', validation.errors);
  }

  questionsCache.set(key, validation.data);
  return validation.data.questions as GeneratedQuestion[];
}

// ---------------------------------------------------------------------------
// 5. generateFlashcards
// ---------------------------------------------------------------------------

/**
 * Generates study flashcards from requirements and questions.
 *
 * Each flashcard is a front/back pair covering a concept, term, or
 * pattern that the candidate should know for this role.
 */
export async function generateFlashcards(
  requirements: ExtractedRequirement[],
  questions: GeneratedQuestion[],
  evidence: string,
  client: LLMClient
): Promise<GeneratedFlashcard[]> {
  const key = LLMCache.key('generateFlashcards', requirements, questions, evidence.slice(0, 200));
  const cached = flashcardsCache.get(key);
  if (cached) {
    logger.debug('generateFlashcards: cache hit');
    return cached.flashcards as GeneratedFlashcard[];
  }

  // Summarise inputs to keep the prompt token-efficient
  const reqSummary = requirements
    .map((r) => `• [${r.id}] ${r.text} (${r.kind}, ${r.priority})`)
    .join('\n');

  const qSummary = questions
    .slice(0, 20) // cap to avoid context overflow
    .map((q) => `• ${q.prompt} [refs: ${q.requirement_ids.join(', ')}]`)
    .join('\n');

  const system = `You are a study-aid creator. Generate concise flashcards for interview preparation.

Rules:
- front: a question or concept prompt (≤ 300 chars).
- back: the answer or explanation (≤ 1000 chars). Be specific and accurate.
- requirement_ids: at least one ID from the requirements list.
- id format: fc_<slug>, e.g. fc_typescript_conditional_types.
- Generate 1-3 flashcards per requirement, prioritising "must" requirements.
- Do NOT repeat information already covered in other flashcards.
- Output ONLY valid JSON.

Expected JSON schema:
${schemaExample('flashcards')}`;

  const userMsg =
    'Generate flashcards for the following requirements and questions.\n' +
    dataBlock('REQUIREMENTS', reqSummary) +
    dataBlock('SAMPLE_QUESTIONS', qSummary) +
    (evidence ? dataBlock('ADDITIONAL_EVIDENCE', evidence.slice(0, 1000)) : '');

  const response = await client.call([{ role: 'user', content: userMsg }], {
    system,
    jsonMode: true,
  });

  const raw = response.json ?? response.text;
  const validation = validateAndNormalizeGeneratedContent<FlashcardsOutput>('flashcards', raw);

  if (!validation.valid || !validation.data) {
    logger.error({ errors: validation.errors }, 'generateFlashcards validation failed');
    throw new GenerationValidationError('generateFlashcards', validation.errors);
  }

  if (validation.normalised.length > 0) {
    logger.warn({ normalised: validation.normalised }, 'generateFlashcards: auto-normalised fields');
  }

  flashcardsCache.set(key, validation.data);
  return validation.data.flashcards as GeneratedFlashcard[];
}

// ---------------------------------------------------------------------------
// 6. generateGapQuestions
// ---------------------------------------------------------------------------

/**
 * Generates additional questions for requirements not yet covered by the
 * existing question set.
 *
 * Used as a coverage sweep after the main question-generation pass.
 */
export async function generateGapQuestions(
  uncoveredRequirements: ExtractedRequirement[],
  existingQuestions: GeneratedQuestion[],
  context: { seniority: string; roleTitle: string },
  client: LLMClient
): Promise<GeneratedQuestion[]> {
  if (uncoveredRequirements.length === 0) {
    return [];
  }

  const key = LLMCache.key('generateGapQuestions', uncoveredRequirements, context);

  const cached = questionsCache.get(key);
  if (cached) {
    logger.debug('generateGapQuestions: cache hit');
    return cached.questions as GeneratedQuestion[];
  }

  const existingPrompts = existingQuestions
    .map((q) => `• ${q.prompt}`)
    .slice(0, 30)
    .join('\n');

  const uncoveredBlock = uncoveredRequirements
    .map((r) => `• [${r.id}] ${r.text} (${r.kind}, ${r.priority})`)
    .join('\n');

  const system = `You are an expert technical interviewer. The following requirements are NOT yet covered by existing interview questions. Generate at least one question per uncovered requirement.

Rules:
- Each question must reference the relevant requirement ID.
- Do NOT duplicate questions that already exist (listed in EXISTING_QUESTIONS).
- Choose the most appropriate category (technical / behavioural / system-design / company-fit) based on the requirement kind.
- Difficulty based on seniority: "${context.seniority || 'mid-level'}".
- id format: q_gap_<slug>.
- Output ONLY valid JSON.

Expected JSON schema:
${schemaExample('questions')}`;

  const userMsg =
    `Generate gap questions for a ${context.seniority || 'mid-level'} ${context.roleTitle} role.\n` +
    dataBlock('UNCOVERED_REQUIREMENTS', uncoveredBlock) +
    dataBlock('EXISTING_QUESTIONS', existingPrompts);

  const response = await client.call([{ role: 'user', content: userMsg }], {
    system,
    jsonMode: true,
  });

  const raw = response.json ?? response.text;
  const validation = validateAndNormalizeGeneratedContent<QuestionsOutput>('questions', raw);

  if (!validation.valid || !validation.data) {
    logger.error({ errors: validation.errors }, 'generateGapQuestions validation failed');
    throw new GenerationValidationError('generateGapQuestions', validation.errors);
  }

  questionsCache.set(key, validation.data);
  return validation.data.questions as GeneratedQuestion[];
}

// ---------------------------------------------------------------------------
// 7. validateAndNormalizeGeneratedContent – re-export for external callers
// ---------------------------------------------------------------------------

export { validateAndNormalizeGeneratedContent } from './validate';
export type { OutputKind } from './validate';

// ---------------------------------------------------------------------------
// Cache management helpers
// ---------------------------------------------------------------------------

/** Clear all generation caches (e.g. after major config changes in tests) */
export function clearGenerationCaches(): void {
  requirementsCache.clear();
  roleCache.clear();
  companyBriefCache.clear();
  questionsCache.clear();
  flashcardsCache.clear();
  logger.debug('All generation caches cleared');
}
