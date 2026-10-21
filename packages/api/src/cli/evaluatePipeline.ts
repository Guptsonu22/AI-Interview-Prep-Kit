/**
 * CLI Evaluation Pipeline Integration
 *
 * Invokes the shared PipelineOrchestrator to ensure batch evaluations run the
 * exact same 17-step pipeline as the web API.
 */

import type { Kit, PipelineInput } from '@interview-prep/shared';
import { validateKit, validateKitReferences } from '@interview-prep/shared';
import { orchestrator, PipelineProgressEvent } from '../pipeline';
import type { LLMClient } from '../llm';

export interface EvaluationResult {
  kit: Kit;
  coverageScore: number;
  errors: string[];
}

export interface RunEvaluationPipelineOptions {
  client?: LLMClient;
  maxCoveragePasses?: number;
  mockCompanyPages?: Array<{ url: string; text: string }>;
  failOnUnreachableCompany?: boolean;
  onProgress?: (event: PipelineProgressEvent) => void;
}

/**
 * Executes the shared end-to-end pipeline for evaluation cases.
 */
export async function runEvaluationPipeline(
  input: PipelineInput | { jobDescription: string; companyUrl: string; prepDays?: number; daysAvailable?: number; userId?: string },
  options: RunEvaluationPipelineOptions = {}
): Promise<EvaluationResult> {
  const errors: string[] = [];
  const days = (input as any).daysAvailable ?? (input as any).prepDays ?? (input as any).days ?? 7;

  try {
    const result = await orchestrator.execute(
      {
        jobDescription: input.jobDescription,
        companyUrl: input.companyUrl,
        daysAvailable: days,
        userId: input.userId || 'evaluator',
      },
      {
        client: options.client,
        maxCoveragePasses: options.maxCoveragePasses,
        mockCompanyPages: options.mockCompanyPages,
        failOnUnreachableCompany: options.failOnUnreachableCompany ?? true,
        onProgress: options.onProgress,
      }
    );

    const kit = result.kit;

    // Validate Kit schema (Appendix A) and reference integrity
    const kitValidation = validateKit(kit);
    if (!kitValidation.success) {
      errors.push(...kitValidation.errors.errors.map((e) => `${e.path.join('.')}: ${e.message}`));
    }

    const refValidation = validateKitReferences(kit);
    if (!refValidation.valid) {
      errors.push(...refValidation.errors);
    }

    if (errors.length > 0) {
      const valErr = new Error(`Kit validation failed: ${errors.join('; ')}`);
      (valErr as any).code = 'VALIDATION_FAILED';
      throw valErr;
    }

    // Compute coverage score (0.0 to 1.0)
    const referencedIds = new Set(kit.questions.flatMap((q) => q.requirement_ids));
    const totalReqs = kit.requirements.length;
    const coveredReqs = kit.requirements.filter((r) => referencedIds.has(r.id)).length;
    const coverageScore = totalReqs > 0 ? coveredReqs / totalReqs : 1.0;

    return {
      kit,
      coverageScore,
      errors,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(errorMsg);
    throw error;
  }
}