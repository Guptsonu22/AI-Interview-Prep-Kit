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
    steps: Array<{
        name: string;
        execute: (context: PipelineContext) => Promise<Partial<PipelineContext>>;
    }>;
    validateOutput: (context: PipelineContext) => {
        valid: boolean;
        errors: string[];
    };
}
export declare function runPipeline(definition: PipelineDefinition, initialContext: PipelineContext): Promise<PipelineContext>;
//# sourceMappingURL=index.d.ts.map