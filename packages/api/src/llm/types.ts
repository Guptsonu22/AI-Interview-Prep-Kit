/**
 * Shared types for the LLM generation subsystem.
 * All external text is treated as untrusted data, never as instructions.
 */

import type { Requirement, Question, Flashcard, CompanyBrief } from '@interview-prep/shared';

// ---------------------------------------------------------------------------
// Provider configuration (read from environment – never hard-coded)
// ---------------------------------------------------------------------------

export type LLMProvider = 'gemini' | 'openai-compat';

export interface LLMConfig {
  /** Provider discriminator – chosen via LLM_PROVIDER env var */
  provider: LLMProvider;
  /** API key – from LLM_API_KEY env var */
  apiKey: string;
  /** Model identifier – from LLM_MODEL env var */
  model: string;
  /** Generation temperature (0 = deterministic) */
  temperature: number;
  /** Base URL for OpenAI-compatible providers */
  baseUrl?: string;
  /** Maximum concurrent LLM calls */
  concurrency: number;
  /** Maximum retries per call */
  maxRetries: number;
  /** Initial retry delay in ms */
  retryBaseMs: number;
}

// ---------------------------------------------------------------------------
// Raw provider response
// ---------------------------------------------------------------------------

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMCallOptions {
  /** System prompt if provider supports it */
  system?: string;
  /** Temperature override */
  temperature?: number;
  /** Whether to request JSON mode */
  jsonMode?: boolean;
}

export interface LLMResponse {
  /** Raw text from the provider */
  text: string;
  /** Parsed JSON if jsonMode was true and parsing succeeded */
  json?: unknown;
  /** Token usage if reported by provider */
  usage?: { promptTokens: number; completionTokens: number };
  /** Model that actually served the request */
  model: string;
}

// ---------------------------------------------------------------------------
// Domain-specific extracted types
// ---------------------------------------------------------------------------

export interface ExtractedRequirement {
  id: string;
  text: string;
  kind: 'technical' | 'behavioural' | 'domain';
  priority: 'must' | 'nice';
  /** Verbatim excerpt from the JD that grounds this requirement */
  source_excerpt?: string;
}

export interface RoleMetadata {
  title: string;
  seniority: string;
  location: string;
  experience_years: string;
  responsibilities: string[];
  /** Raw JD sections used to derive this metadata */
  evidence: string[];
}

export interface GeneratedQuestion {
  id: string;
  requirement_ids: string[];
  category: 'technical' | 'behavioural' | 'system-design' | 'company-fit';
  prompt: string;
  answer_outline: string;
  difficulty: 1 | 2 | 3;
}

export interface GeneratedFlashcard {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
}

export interface GeneratedCompanyBrief {
  summary: string;
  what_they_do: string;
  sources: string[];
  /** true when evidence was insufficient – no invented facts */
  unverified_fields: string[];
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: string[];
  /** Fields that were repaired / normalised */
  normalised: string[];
}

// ---------------------------------------------------------------------------
// Cache key helpers
// ---------------------------------------------------------------------------

export type CacheKey = string;
