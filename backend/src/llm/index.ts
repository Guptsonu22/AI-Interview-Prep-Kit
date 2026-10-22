/**
 * Public barrel for the LLM subsystem.
 *
 * Import from here in the rest of the API:
 *   import { extractJobRequirements, createLLMClient } from '../llm';
 */

export { createLLMClient, getDefaultLLMClient, resetDefaultLLMClient, LLMError } from './client';
export type { LLMClient, } from './client';

export {
  extractJobRequirements,
  identifyRoleMetadata,
  generateCompanyBrief,
  generateQuestionsForRequirement,
  generateFlashcards,
  generateGapQuestions,
  validateAndNormalizeGeneratedContent,
  clearGenerationCaches,
  GenerationValidationError,
} from './generation';

export type { OutputKind } from './validate';

export { LLMCache, withCache } from './cache';

export type {
  LLMConfig,
  LLMProvider,
  LLMMessage,
  LLMCallOptions,
  LLMResponse,
  ExtractedRequirement,
  RoleMetadata,
  GeneratedQuestion,
  GeneratedFlashcard,
  GeneratedCompanyBrief,
  ValidationResult,
  CacheKey,
} from './types';

export {
  ExtractedRequirementSchema,
  RequirementsOutputSchema,
  RoleMetadataSchema,
  CompanyBriefOutputSchema,
  GeneratedQuestionSchema,
  QuestionsOutputSchema,
  GeneratedFlashcardSchema,
  FlashcardsOutputSchema,
  GapQuestionsOutputSchema,
  schemaExample,
} from './schemas';
