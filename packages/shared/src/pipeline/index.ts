export interface PipelineStep<TInput, TOutput> {
  name: string;
  execute(input: TInput): Promise<TOutput>;
}

export interface PipelineContext {
  jobDescription: string;
  companyUrl: string;
  prepDays: number;
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