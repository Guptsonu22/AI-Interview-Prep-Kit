import { program } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../config';
import { connectDatabase, disconnectDatabase } from '../db';
import { runEvaluationPipeline } from './evaluatePipeline';

const __dirname = path.resolve();

interface EvaluationCase {
  id: string;
  jobDescription: string;
  companyUrl: string;
  prepDays: number;
}

interface EvaluationOutput {
  caseId: string;
  kit: unknown;
  metadata: {
    generatedAt: string;
    pipelineVersion: string;
    durationMs: number;
    coverageScore: number;
    errors: string[];
  };
}

program
  .name('evaluate')
  .description('Batch evaluate interview prep kits')
  .requiredOption('-i, --input <file>', 'Input JSON file with evaluation cases')
  .requiredOption('-o, --output <file>', 'Output JSON file for generated kits')
  .option('-c, --concurrency <number>', 'Number of concurrent evaluations', '1')
  .option('--user-id <id>', 'User ID to associate with generated kits', 'eval-user');

program.parse();

const options = program.opts();

async function main(): Promise<void> {
  console.log('[evaluate] Starting batch evaluation...');
  console.log(`[evaluate] Input: ${options['input']}`);
  console.log(`[evaluate] Output: ${options['output']}`);
  console.log(`[evaluate] Concurrency: ${options['concurrency']}`);

  await connectDatabase();

  const inputPath = path.resolve(options['input']);
  const inputContent = await fs.readFile(inputPath, 'utf-8');
  const cases: EvaluationCase[] = JSON.parse(inputContent);

  console.log(`[evaluate] Loaded ${cases.length} cases`);

  const concurrency = parseInt(options['concurrency'], 10);
  const results: EvaluationOutput[] = [];

  for (let i = 0; i < cases.length; i += concurrency) {
    const batch = cases.slice(i, i + concurrency);
    const batchPromises = batch.map((case_) => runSingleEvaluation(case_, options['userId']));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    console.log(`[evaluate] Completed ${Math.min(i + concurrency, cases.length)}/${cases.length} cases`);
  }

  const outputPath = path.resolve(options['output']);
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
  console.log(`[evaluate] Results written to ${outputPath}`);

  await disconnectDatabase();
  console.log('[evaluate] Done.');
}

async function runSingleEvaluation(
  case_: EvaluationCase,
  userId: string
): Promise<EvaluationOutput> {
  const startTime = Date.now();
  let errors: string[] = [];
  let kit: unknown = null;
  let coverageScore = 0;

  try {
    const result = await runEvaluationPipeline({
      jobDescription: case_.jobDescription,
      companyUrl: case_.companyUrl,
      prepDays: case_.prepDays,
      userId,
    });
    kit = result.kit;
    coverageScore = result.coverageScore;
    errors = result.errors;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return {
    caseId: case_.id,
    kit,
    metadata: {
      generatedAt: new Date().toISOString(),
      pipelineVersion: '1.0.0',
      durationMs: Date.now() - startTime,
      coverageScore,
      errors,
    },
  };
}

main().catch((err) => {
  console.error('[evaluate] Fatal error:', err);
  process.exit(1);
});