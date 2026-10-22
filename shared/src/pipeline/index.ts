import type { Kit, PipelineInput } from '../schema/kit';

export interface PipelineContext {
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
  userId: string;
  intermediate: Record<string, unknown>;
}

export interface PipelineDefinition {
  steps: Array<{ name: string; execute: (context: PipelineContext) => Promise<Partial<PipelineContext>> }>;
  validateOutput: (context: PipelineContext) => { valid: boolean; errors: string[] };
}

export async function runPipeline(
  definition: PipelineDefinition,
  initialContext: PipelineContext
): Promise<PipelineContext> {
  let context = { ...initialContext, intermediate: {} };

  for (const step of definition.steps) {
    const stepName = step.name;
    try {
      const result = await step.execute(context);
      context = { ...context, ...result, intermediate: { ...context.intermediate, [stepName]: result } };
    } catch (error) {
      throw new Error(`Pipeline step "${stepName}" failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const validation = definition.validateOutput(context);
  if (!validation.valid) {
    throw new Error(`Pipeline output validation failed: ${validation.errors.join(', ')}`);
  }

  return context;
}

export function createPipelineInput(input: PipelineInput): PipelineContext {
  return {
    jobDescription: input.jobDescription,
    companyUrl: input.companyUrl,
    daysAvailable: input.daysAvailable,
    userId: input.userId,
    intermediate: {},
  };
}

export function buildKitFromContext(context: PipelineContext): Kit {
  const intermediate = context.intermediate;

  return {
    source: intermediate['source'] as Kit['source'],
    company_brief: intermediate['company_brief'] as Kit['company_brief'],
    role: intermediate['role'] as Kit['role'],
    requirements: intermediate['requirements'] as Kit['requirements'],
    questions: intermediate['questions'] as Kit['questions'],
    flashcards: intermediate['flashcards'] as Kit['flashcards'],
    schedule: intermediate['schedule'] as Kit['schedule'],
    coverage: intermediate['coverage'] as Kit['coverage'],
  };
}