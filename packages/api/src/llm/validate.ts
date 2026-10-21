/**
 * validateAndNormalizeGeneratedContent
 *
 * Central validation and normalisation pass applied to every LLM response.
 * Responsibilities:
 *   1. Parse JSON from raw text when the caller did not already get JSON.
 *   2. Apply the correct Zod schema.
 *   3. Repair common model mistakes (e.g. wrong id prefix, coercing difficulty).
 *   4. Return a typed ValidationResult – never throw on schema error.
 *
 * This is the shared function referenced by all generation functions.
 */

import { ZodSchema, z } from 'zod';
import type { ValidationResult } from './types';
import {
  RequirementsOutputSchema,
  RoleMetadataSchema,
  CompanyBriefOutputSchema,
  QuestionsOutputSchema,
  FlashcardsOutputSchema,
  type RequirementsOutput,
  type RoleMetadataOutput,
  type CompanyBriefOutput,
  type QuestionsOutput,
  type FlashcardsOutput,
} from './schemas';

export type OutputKind =
  | 'requirements'
  | 'role'
  | 'company_brief'
  | 'questions'
  | 'flashcards';

const SCHEMA_MAP: Record<OutputKind, ZodSchema<unknown>> = {
  requirements: RequirementsOutputSchema,
  role: RoleMetadataSchema,
  company_brief: CompanyBriefOutputSchema,
  questions: QuestionsOutputSchema,
  flashcards: FlashcardsOutputSchema,
};

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function tryParseJson(text: string): unknown {
  const stripped = text
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

/**
 * Attempt shallow repairs on the raw object before schema validation.
 * Returns a mutated copy and a list of field names that were repaired.
 */
function repairObject(kind: OutputKind, raw: unknown): { data: unknown; normalised: string[] } {
  const normalised: string[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { data: raw, normalised };
  }

  const obj = { ...(raw as Record<string, unknown>) };

  // -----------------------------------------------------------------------
  // requirements: fix id prefix, clamp text length, default optional fields
  // -----------------------------------------------------------------------
  if (kind === 'requirements' && Array.isArray(obj['requirements'])) {
    obj['requirements'] = (obj['requirements'] as unknown[]).map((item) => {
      if (typeof item !== 'object' || item === null) return item;
      const r = { ...(item as Record<string, unknown>) };

      // Ensure id starts with req_
      if (typeof r['id'] === 'string' && !r['id'].startsWith('req_')) {
        r['id'] = `req_${r['id'].replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`;
        normalised.push('requirements[].id');
      }

      // Trim overly long text
      if (typeof r['text'] === 'string' && r['text'].length > 500) {
        r['text'] = r['text'].slice(0, 497) + '…';
        normalised.push('requirements[].text');
      }

      // Default source_excerpt
      if (!r['source_excerpt'] || typeof r['source_excerpt'] !== 'string') {
        r['source_excerpt'] = typeof r['text'] === 'string' ? r['text'].slice(0, 100) : '';
        normalised.push('requirements[].source_excerpt');
      }

      return r;
    });
  }

  // -----------------------------------------------------------------------
  // questions: fix id prefix, clamp difficulty to 1-3
  // -----------------------------------------------------------------------
  if (
    (kind === 'questions' || kind === 'flashcards') &&
    Array.isArray(obj['questions'] ?? obj['flashcards'])
  ) {
    const arrKey = kind === 'questions' ? 'questions' : 'flashcards';
    const prefix = kind === 'questions' ? 'q_' : 'fc_';
    obj[arrKey] = (obj[arrKey] as unknown[]).map((item) => {
      if (typeof item !== 'object' || item === null) return item;
      const q = { ...(item as Record<string, unknown>) };

      if (typeof q['id'] === 'string' && !q['id'].startsWith(prefix)) {
        q['id'] = `${prefix}${q['id'].replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`;
        normalised.push(`${arrKey}[].id`);
      }

      // Clamp difficulty
      if (kind === 'questions') {
        const d = Number(q['difficulty']);
        if (!Number.isFinite(d) || d < 1 || d > 3) {
          q['difficulty'] = Math.min(3, Math.max(1, Math.round(d) || 2));
          normalised.push('questions[].difficulty');
        }
      }

      return q;
    });
  }

  return { data: obj, normalised };
}

// ---------------------------------------------------------------------------
// Main validation function
// ---------------------------------------------------------------------------

/**
 * Validate and normalise an LLM output value.
 *
 * @param kind    The output type to validate against
 * @param output  Raw value from the LLM (string or already-parsed object)
 */
export function validateAndNormalizeGeneratedContent<T = unknown>(
  kind: OutputKind,
  output: unknown
): ValidationResult<T> {
  const errors: string[] = [];

  // Step 1 – parse if still a string
  let parsed: unknown = output;
  if (typeof output === 'string') {
    parsed = tryParseJson(output);
    if (parsed === null) {
      return {
        valid: false,
        errors: ['Response is not valid JSON and could not be repaired'],
        normalised: [],
      };
    }
  }

  // Step 2 – attempt repairs
  const { data: repaired, normalised } = repairObject(kind, parsed);

  // Step 3 – schema validation
  const schema = SCHEMA_MAP[kind];
  const result = (schema as z.ZodSchema<T>).safeParse(repaired);

  if (!result.success) {
    const zodErrors = result.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`
    );
    return { valid: false, errors: zodErrors, normalised };
  }

  return { valid: true, data: result.data, errors: [], normalised };
}
