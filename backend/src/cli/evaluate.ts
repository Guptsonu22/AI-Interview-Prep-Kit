#!/usr/bin/env node

/**
 * Batch Evaluator CLI Entry Point (Prompt 10)
 *
 * Command:
 *   npm run evaluate -- --input <cases.json> --output <kits.json>
 *
 * Input format:
 *   [
 *     {
 *       "id": "case-01",
 *       "jd": "Job description text",
 *       "company_url": "http://localhost:8099/acme/",
 *       "days": 5
 *     }
 *   ]
 *
 * Output format:
 *   {
 *     "version": "1.0",
 *     "generated_at": "ISO-8601 timestamp",
 *     "kits": [
 *       {
 *         "id": "case-01",
 *         "status": "ok",
 *         "kit": { ... },
 *         "error": null
 *       },
 *       {
 *         "id": "case-04",
 *         "status": "failed",
 *         "kit": null,
 *         "error": {
 *           "code": "COMPANY_UNREACHABLE",
 *           "message": "A useful error message"
 *         }
 *       }
 *     ]
 *   }
 */

import { Command } from 'commander';
const program = new Command();
import * as fs from 'fs/promises';
import * as path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { runEvaluationPipeline } from './evaluatePipeline';
import type { LLMClient } from '../llm';

function pLimit(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    if (queue.length > 0) {
      const runNext = queue.shift();
      if (runNext) runNext();
    }
  };
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.env['INIT_CWD'] || process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export interface CaseInput {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

export interface CaseSuccessOutput {
  id: string;
  status: 'ok';
  kit: unknown;
  error: null;
}

export interface CaseFailureOutput {
  id: string;
  status: 'failed';
  kit: null;
  error: {
    code: string;
    message: string;
  };
}

export type CaseOutput = CaseSuccessOutput | CaseFailureOutput;

export interface BatchEvaluationOutput {
  version: string;
  generated_at: string;
  kits: CaseOutput[];
}

// Flexible input parser accepting both Prompt 10 exact names and standard camelCase aliases
export const RawCaseSchema = z.object({
  id: z.string().min(1, 'Case must have a non-empty "id"'),
  jd: z.string().optional(),
  jobDescription: z.string().optional(),
  company_url: z.string().optional(),
  companyUrl: z.string().optional(),
  days: z.number().int().positive().optional(),
  daysAvailable: z.number().int().positive().optional(),
  prepDays: z.number().int().positive().optional(),
}).transform((data) => {
  const jd = data.jd ?? data.jobDescription;
  const companyUrl = data.company_url ?? data.companyUrl;
  const days = data.days ?? data.daysAvailable ?? data.prepDays ?? 7;

  if (!jd || typeof jd !== 'string' || jd.trim().length === 0) {
    throw new Error(`Invalid evaluation case structure: Case "${data.id}" must provide non-empty "jd" (or "jobDescription")`);
  }
  if (!companyUrl || typeof companyUrl !== 'string' || companyUrl.trim().length === 0) {
    throw new Error(`Invalid evaluation case structure: Case "${data.id}" must provide non-empty "company_url" (or "companyUrl")`);
  }

  return {
    id: data.id,
    jd: jd.trim(),
    company_url: companyUrl.trim(),
    days,
  };
});

export const BatchCasesSchema = z.array(RawCaseSchema);

export interface BatchEvaluationRunnerOptions {
  inputPath: string;
  outputPath: string;
  concurrency?: number;
  client?: LLMClient;
  maxCoveragePasses?: number;
  mockCompanyPages?: Array<{ url: string; text: string }>;
  allowLocalhost?: boolean;
}

/**
 * Core evaluation engine shared between CLI and automated test suite.
 */
export async function runBatchEvaluation(options: BatchEvaluationRunnerOptions): Promise<BatchEvaluationOutput> {
  const baseDir = process.env['INIT_CWD'] || process.cwd();
  let resolvedInput = path.isAbsolute(options.inputPath)
    ? options.inputPath
    : path.resolve(baseDir, options.inputPath);

  // If not found in baseDir, fallback to current working directory or relative to root
  let rawFileContent: string;
  try {
    rawFileContent = await fs.readFile(resolvedInput, 'utf-8');
  } catch {
    resolvedInput = path.resolve(process.cwd(), options.inputPath);
    try {
      rawFileContent = await fs.readFile(resolvedInput, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to read input file at "${resolvedInput}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const resolvedOutput = path.isAbsolute(options.outputPath)
    ? options.outputPath
    : path.resolve(baseDir, options.outputPath);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawFileContent);
  } catch (err) {
    throw new Error(`Malformed JSON in input file "${resolvedInput}": ${err instanceof Error ? err.message : String(err)}`);
  }

  const validationResult = BatchCasesSchema.safeParse(parsedJson);
  if (!validationResult.success) {
    const errorDetails = validationResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Invalid evaluation case structure in "${resolvedInput}": ${errorDetails}`);
  }

  const cases = validationResult.data;
  if (cases.length === 0) {
    console.warn('[evaluate] Warning: Input cases array is empty');
  }

  process.env['ALLOW_LOCALHOST'] = options.allowLocalhost ? 'true' : 'false';

  const concurrency = Math.max(1, options.concurrency || 2);
  const limit = pLimit(concurrency);

  console.log(`[evaluate] Processing ${cases.length} evaluation case(s) with concurrency limit = ${concurrency}...`);

  const results: CaseOutput[] = new Array(cases.length);

  const tasks = cases.map((caseItem, index) =>
    limit(async () => {
      const caseStartTime = Date.now();
      console.log(`[evaluate] [${index + 1}/${cases.length}] Starting case "${caseItem.id}" (days: ${caseItem.days})...`);

      try {
        const pipelineResult = await runEvaluationPipeline(
          {
            jobDescription: caseItem.jd,
            companyUrl: caseItem.company_url,
            daysAvailable: caseItem.days,
            userId: `eval_${caseItem.id}`,
          },
          {
            client: options.client,
            maxCoveragePasses: options.maxCoveragePasses,
            mockCompanyPages: options.mockCompanyPages,
            failOnUnreachableCompany: true,
          }
        );

        results[index] = {
          id: caseItem.id,
          status: 'ok',
          kit: pipelineResult.kit,
          error: null,
        };

        const duration = ((Date.now() - caseStartTime) / 1000).toFixed(1);
        console.log(`[evaluate] [${index + 1}/${cases.length}] Finished case "${caseItem.id}" [OK] (${duration}s)`);
      } catch (err) {
        const errorCode = (err as any)?.code || 'GENERATION_FAILED';
        const errorMessage = err instanceof Error ? err.message : String(err);

        results[index] = {
          id: caseItem.id,
          status: 'failed',
          kit: null,
          error: {
            code: errorCode,
            message: errorMessage,
          },
        };

        const duration = ((Date.now() - caseStartTime) / 1000).toFixed(1);
        console.warn(`[evaluate] [${index + 1}/${cases.length}] Failed case "${caseItem.id}" [FAILED: ${errorCode}] (${duration}s): ${errorMessage}`);
      }
    })
  );

  await Promise.all(tasks);

  const outputPayload: BatchEvaluationOutput = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    kits: results,
  };

  // Ensure parent directory exists for output
  const outputDir = path.dirname(resolvedOutput);
  await fs.mkdir(outputDir, { recursive: true });

  await fs.writeFile(resolvedOutput, JSON.stringify(outputPayload, null, 2), 'utf-8');
  console.log(`[evaluate] Evaluation completed successfully. Output written to: ${resolvedOutput}`);

  return outputPayload;
}

// ────────────────────────────────────────────────────────────────────────────
// CLI Command Parser Setup
// ────────────────────────────────────────────────────────────────────────────

export async function cli(): Promise<void> {
  program
    .name('evaluate')
    .description('Evaluate interview preparation kits from a batch JSON input file')
    .requiredOption('-i, --input <file>', 'Path to input JSON file containing array of cases')
    .requiredOption('-o, --output <file>', 'Path to output JSON file to write results')
    .option('-c, --concurrency <number>', 'Controlled concurrency limit (default: 2)', '2')
    .option('--allow-localhost', 'Allow crawling localhost fixture servers for evaluation', false)
    .parse(process.argv);

  const opts = program.opts();

  if (!opts['input']) {
    console.error('[evaluate] Error: Required argument --input <file> is missing');
    process.exit(1);
  }
  if (!opts['output']) {
    console.error('[evaluate] Error: Required argument --output <file> is missing');
    process.exit(1);
  }

  try {
    await runBatchEvaluation({
      inputPath: opts['input'],
      outputPath: opts['output'],
      concurrency: parseInt(opts['concurrency'], 10) || 2,
      allowLocalhost: opts['allowLocalhost'] === true,
    });
  } catch (error) {
    console.error('[evaluate] Evaluation failed with fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run CLI directly if invoked from command line
const isMainModule = () => {
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    return true;
  }
  if (!process.argv[1]) return false;
  try {
    const invokedFile = path.resolve(process.argv[1]).toLowerCase();
    return (
      invokedFile.endsWith('evaluate.ts') ||
      invokedFile.endsWith('evaluate.js') ||
      invokedFile.endsWith('evaluate')
    );
  } catch {
    return false;
  }
};

if (isMainModule()) {
  cli();
}
