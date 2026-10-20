"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPipeline = runPipeline;
async function runPipeline(definition, initialContext) {
    let context = { ...initialContext, intermediate: {} };
    for (const step of definition.steps) {
        const stepName = step.name;
        try {
            const result = await step.execute(context);
            context = { ...context, ...result, intermediate: { ...context.intermediate, [stepName]: result } };
        }
        catch (error) {
            throw new Error(`Pipeline step "${stepName}" failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    const validation = definition.validateOutput(context);
    if (!validation.valid) {
        throw new Error(`Pipeline output validation failed: ${validation.errors.join(', ')}`);
    }
    return context;
}
