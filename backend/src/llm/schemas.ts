/**
 * Shared Zod schemas for every LLM-generated JSON shape.
 *
 * These schemas are the single source of truth for what the LLM must produce.
 * They are used both to validate raw LLM output and to build system-prompt
 * examples so the model knows the expected format.
 *
 * All schemas are strict (no unknown keys) to prevent prompt-injection data
 * from polluting downstream processing.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Requirement extraction
// ---------------------------------------------------------------------------

export const ExtractedRequirementSchema = z.object({
  id: z
    .string()
    .regex(/^req_[a-z0-9_]+$/, 'id must match req_<slug> pattern')
    .min(5),
  text: z.string().min(10).max(500),
  kind: z.enum(['technical', 'behavioural', 'domain']),
  priority: z.enum(['must', 'nice']),
  source_excerpt: z.string().min(5).max(300),
});

export const RequirementsOutputSchema = z.object({
  requirements: z.array(ExtractedRequirementSchema).min(1).max(40),
});

// ---------------------------------------------------------------------------
// Role metadata
// ---------------------------------------------------------------------------

export const RoleMetadataSchema = z.object({
  title: z.string().min(2).max(200),
  seniority: z.string().max(100).default(''),
  location: z.string().max(200).default(''),
  experience_years: z.string().max(100).default(''),
  responsibilities: z.array(z.string().min(5).max(300)).default([]),
  evidence: z.array(z.string().min(5).max(500)).default([]),
});

// ---------------------------------------------------------------------------
// Company brief
// ---------------------------------------------------------------------------

export const CompanyBriefOutputSchema = z.object({
  summary: z.string().max(2000).default(''),
  what_they_do: z.string().max(1000).default(''),
  sources: z.array(z.string().url()).default([]),
  unverified_fields: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export const GeneratedQuestionSchema = z.object({
  id: z
    .string()
    .regex(/^q_[a-z0-9_]+$/, 'id must match q_<slug> pattern')
    .min(3),
  requirement_ids: z.array(z.string().min(5)).min(1),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']),
  prompt: z.string().min(1).max(2000),
  answer_outline: z.string().max(4000).default(''),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const QuestionsOutputSchema = z.object({
  questions: z.array(GeneratedQuestionSchema).min(1).max(20),
});

// ---------------------------------------------------------------------------
// Flashcards
// ---------------------------------------------------------------------------

export const GeneratedFlashcardSchema = z.object({
  id: z
    .string()
    .regex(/^fc_[a-z0-9_]+$/, 'id must match fc_<slug> pattern')
    .min(4),
  front: z.string().min(10).max(300),
  back: z.string().min(10).max(1000),
  requirement_ids: z.array(z.string().min(5)).min(1),
});

export const FlashcardsOutputSchema = z.object({
  flashcards: z.array(GeneratedFlashcardSchema).min(1).max(60),
});

// ---------------------------------------------------------------------------
// Gap questions (same shape as regular questions)
// ---------------------------------------------------------------------------

export const GapQuestionsOutputSchema = QuestionsOutputSchema;

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ExtractedRequirementOutput = z.infer<typeof ExtractedRequirementSchema>;
export type RequirementsOutput = z.infer<typeof RequirementsOutputSchema>;
export type RoleMetadataOutput = z.infer<typeof RoleMetadataSchema>;
export type CompanyBriefOutput = z.infer<typeof CompanyBriefOutputSchema>;
export type GeneratedQuestionOutput = z.infer<typeof GeneratedQuestionSchema>;
export type QuestionsOutput = z.infer<typeof QuestionsOutputSchema>;
export type GeneratedFlashcardOutput = z.infer<typeof GeneratedFlashcardSchema>;
export type FlashcardsOutput = z.infer<typeof FlashcardsOutputSchema>;

// ---------------------------------------------------------------------------
// Schema-to-JSON string helper (for prompt embedding)
// ---------------------------------------------------------------------------

/** Returns a compact JSON representation of the expected output schema for use in prompts. */
export function schemaExample(schemaName: string): string {
  const examples: Record<string, unknown> = {
    requirements: {
      requirements: [
        {
          id: 'req_typescript',
          text: 'Proficiency in TypeScript',
          kind: 'technical',
          priority: 'must',
          source_excerpt: '5+ years of experience with TypeScript',
        },
      ],
    },
    role: {
      title: 'Senior Software Engineer',
      seniority: 'senior',
      location: 'Remote (US)',
      experience_years: '5+',
      responsibilities: ['Design and implement scalable APIs'],
      evidence: ['Lead the design…'],
    },
    company_brief: {
      summary: 'Acme Corp builds cloud data tools.',
      what_they_do: 'Provides real-time data pipeline SaaS.',
      sources: ['https://acme.com/about'],
      unverified_fields: [],
    },
    questions: {
      questions: [
        {
          id: 'q_ts_advanced',
          requirement_ids: ['req_typescript'],
          category: 'technical',
          prompt: 'Explain TypeScript conditional types with an example.',
          answer_outline: 'Discuss T extends U ? X : Y, distributive behaviour…',
          difficulty: 2,
        },
      ],
    },
    flashcards: {
      flashcards: [
        {
          id: 'fc_ts_conditional',
          front: 'What are conditional types in TypeScript?',
          back: 'T extends U ? X : Y – a type that resolves based on a condition.',
          requirement_ids: ['req_typescript'],
        },
      ],
    },
  };
  return JSON.stringify(examples[schemaName] ?? {}, null, 2);
}
