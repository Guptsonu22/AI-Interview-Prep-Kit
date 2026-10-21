/**
 * Sequential Generation Pipeline Orchestrator
 *
 * Implements the deliberate 17-step end-to-end generation sequence:
 *  1. Validate the input case
 *  2. Normalize the company URL and job description
 *  3. Extract role metadata and requirements from the pasted JD (never from web)
 *  4. Crawl the company site
 *  5. Discover and retrieve relevant company and hiring pages
 *  6. Search for public interview-process evidence
 *  7. Generate the company brief using the evidence actually retrieved
 *  8. Generate technical, behavioural, system-design, and company-fit questions
 *     in separate deliberate steps
 *  9. Generate flashcards linked to requirement IDs
 * 10. Run the deterministic coverage checker (Pass 1)
 * 11. Identify every uncovered must-have requirement
 * 12. Generate targeted questions for the missing requirements
 * 13. Re-run the coverage checker
 * 14. Repeat until all must-haves are covered or max passes reached
 * 15. Write an explicit gap analysis into kit metadata if uncovered requirements remain
 * 16. Generate the preparation plan structured by the days available
 * 17. Emit progress events at every step and save complete kit only upon success
 */

import pino from 'pino';
import type {
  Kit,
  Requirement,
  Question,
  Flashcard,
  Role,
  CompanyBrief,
  Source,
} from '@interview-prep/shared';
import { validateKit, validateKitReferences } from '@interview-prep/shared';
import { generateSchedule } from '@interview-prep/shared/scheduler';

import {
  extractJobRequirements,
  identifyRoleMetadata,
  generateCompanyBrief,
  generateQuestionsForRequirement,
  generateFlashcards,
  generateGapQuestions,
  getDefaultLLMClient,
  type LLMClient,
} from '../llm';

import {
  crawlCompanySite,
  selectResearchSources,
  type CrawlerOptions,
  type PageResult,
} from '../modules/research';

import {
  computeCoverage,
  toCoverageSchema,
  deduplicateQuestions,
  type CoverageReport,
} from './coverage';

import {
  validateAndNormalizeInput,
  type NormalizedInput,
} from './normalize';

import {
  idempotencyManager,
  type PipelineResult,
} from './idempotency';

const logger = pino({ name: 'pipeline-orchestrator' });

export interface PipelineProgressEvent {
  step: number;
  totalSteps: number;
  stepName: string;
  message: string;
  timestamp: Date;
  data?: unknown;
}

export interface OrchestratorOptions {
  client?: LLMClient;
  maxCoveragePasses?: number;
  crawlerOptions?: CrawlerOptions;
  mockCompanyPages?: Array<{ url: string; text: string }>;
  onProgress?: (event: PipelineProgressEvent) => void | Promise<void>;
  deduplicate?: boolean;
}

export class PipelineOrchestrator {
  private defaultMaxPasses = 3;

  /**
   * Run the end-to-end pipeline with full 17-step sequential execution.
   */
  public async execute(
    rawInput: unknown,
    options: OrchestratorOptions = {}
  ): Promise<PipelineResult> {
    const totalSteps = 17;
    const client = options.client ?? getDefaultLLMClient();
    const maxPasses = options.maxCoveragePasses ?? this.defaultMaxPasses;
    const onProgress = options.onProgress;

    const emit = async (
      step: number,
      stepName: string,
      message: string,
      data?: unknown
    ) => {
      logger.info({ step, stepName, message }, `[Pipeline Step ${step}/${totalSteps}] ${message}`);
      if (onProgress) {
        try {
          await onProgress({
            step,
            totalSteps,
            stepName,
            message,
            timestamp: new Date(),
            data,
          });
        } catch (err) {
          logger.warn({ err }, 'Error in progress listener');
        }
      }
    };

    // ──────────────────────────────────────────────────────────────────────────
    // Step 1: Validate the input case
    // ──────────────────────────────────────────────────────────────────────────
    await emit(1, 'validate-input', 'Validating input parameters');
    const normalizedInput: NormalizedInput = validateAndNormalizeInput(rawInput);

    // ──────────────────────────────────────────────────────────────────────────
    // Step 2: Normalize the company URL and job description
    // ──────────────────────────────────────────────────────────────────────────
    await emit(2, 'normalize-input', 'Normalizing job description and company URL', {
      url: normalizedInput.companyUrl,
      jdLength: normalizedInput.jobDescription.length,
    });

    const runner = async (): Promise<PipelineResult> => {
      // ────────────────────────────────────────────────────────────────────────
      // Step 3: Extract role metadata and requirements from the pasted JD
      //         (Strictly using pasted JD, never retrieving JD from the web)
      // ────────────────────────────────────────────────────────────────────────
      await emit(3, 'extract-jd-metadata', 'Extracting role metadata and requirements from JD');
      const [roleMeta, extractedReqs] = await Promise.all([
        identifyRoleMetadata(normalizedInput.jobDescription, client),
        extractJobRequirements(normalizedInput.jobDescription, client),
      ]);

      const requirements: Requirement[] = extractedReqs.map((r) => ({
        id: r.id,
        text: r.text,
        kind: r.kind,
        priority: r.priority,
      }));

      // Ensure at least one must-have requirement exists
      if (requirements.length === 0) {
        requirements.push({
          id: 'req_core_role',
          text: `Core responsibilities and qualifications for ${roleMeta.title || 'the role'}`,
          kind: 'technical',
          priority: 'must',
        });
      }

      const role: Role = {
        title: roleMeta.title || 'Software Engineer',
        seniority: roleMeta.seniority || 'Mid',
        responsibilities: roleMeta.responsibilities || [],
        requirements: roleMeta.evidence || requirements.map((r) => r.text),
      };

      // ────────────────────────────────────────────────────────────────────────
      // Step 4: Crawl the company site
      // ────────────────────────────────────────────────────────────────────────
      await emit(4, 'crawl-company-site', `Crawling company site: ${normalizedInput.companyUrl}`);
      let crawledPages: Array<{ url: string; content: string }> = [];

      if (options.mockCompanyPages && options.mockCompanyPages.length > 0) {
        crawledPages = options.mockCompanyPages.map((p) => ({
          url: p.url,
          content: p.text,
        }));
      } else {
        try {
          const crawlResult = await crawlCompanySite(normalizedInput.companyUrl, {
            maxPages: 10,
            maxDepth: 2,
            requestTimeoutMs: 10000,
            totalTimeoutMs: 30000,
            ...options.crawlerOptions,
          });

          crawledPages = crawlResult.pages
            .filter((p) => p.status === 'success' && p.content.length > 50)
            .map((p) => ({ url: p.url, content: p.content }));
        } catch (crawlErr) {
          logger.warn({ err: crawlErr }, 'Company crawl had errors; proceeding with partial evidence');
        }
      }

      // ────────────────────────────────────────────────────────────────────────
      // Step 5: Discover and retrieve relevant company and hiring pages
      // ────────────────────────────────────────────────────────────────────────
      await emit(5, 'discover-hiring-pages', `Discovering relevant company and hiring pages (found ${crawledPages.length})`);
      const hiringKeywords = ['about', 'company', 'career', 'job', 'team', 'culture', 'value', 'mission'];
      const relevantPages = crawledPages.filter((p) => {
        const lowerUrl = p.url.toLowerCase();
        return hiringKeywords.some((k) => lowerUrl.includes(k));
      });
      const pagesToUse = relevantPages.length > 0 ? relevantPages : crawledPages.slice(0, 5);

      // ────────────────────────────────────────────────────────────────────────
      // Step 6: Search for public interview-process evidence
      // ────────────────────────────────────────────────────────────────────────
      await emit(6, 'search-interview-evidence', 'Searching for public interview-process evidence');
      const interviewKeywords = [
        'interview',
        'hiring process',
        'recruitment',
        'coding challenge',
        'technical screen',
        'onsite',
        'assessment',
        'take-home',
      ];

      const interviewSnippets: string[] = [];
      const sourcesUsedSet = new Set<string>();

      for (const page of pagesToUse) {
        sourcesUsedSet.add(page.url);
        const lower = page.content.toLowerCase();
        for (const kw of interviewKeywords) {
          const idx = lower.indexOf(kw);
          if (idx !== -1) {
            const start = Math.max(0, idx - 100);
            const end = Math.min(page.content.length, idx + 300);
            interviewSnippets.push(page.content.slice(start, end).trim());
            break;
          }
        }
      }

      if (sourcesUsedSet.size === 0) {
        sourcesUsedSet.add(normalizedInput.companyUrl);
      }

      const hiringProcessEvidence = interviewSnippets.join('\n---\n');

      // ────────────────────────────────────────────────────────────────────────
      // Step 7: Generate the company brief using the evidence actually retrieved
      // ────────────────────────────────────────────────────────────────────────
      await emit(7, 'generate-company-brief', 'Generating company brief from retrieved evidence');
      const companyEvidence = pagesToUse.map((p) => ({ text: p.content, url: p.url }));
      const briefOutput = await generateCompanyBrief(companyEvidence, client);

      const companyBrief: CompanyBrief = {
        summary: briefOutput.summary || `Interview preparation for ${role.title} at ${normalizedInput.companyUrl}`,
        what_they_do: briefOutput.what_they_do || 'Technology company',
        sources: briefOutput.sources.length > 0 ? briefOutput.sources : Array.from(sourcesUsedSet),
      };

      const source: Source = {
        company: extractCompanyName(normalizedInput.companyUrl),
        company_url: normalizedInput.companyUrl,
        role: role.title,
        location: roleMeta.location || 'Remote',
        jd_chars: normalizedInput.jobDescription.length,
        researched_at: new Date().toISOString(),
        pages_used: Array.from(sourcesUsedSet),
      };

      // Context bundle for question generation
      const genContext = {
        seniority: role.seniority,
        roleTitle: role.title,
        companyBrief: companyBrief.summary,
        hiringProcess: hiringProcessEvidence || undefined,
      };

      // ────────────────────────────────────────────────────────────────────────
      // Step 8: Generate technical, behavioural, system-design, and
      //         company-fit questions in separate deliberate steps
      // ────────────────────────────────────────────────────────────────────────
      const accumulatedQuestions: Question[] = [];

      // 8a: Technical questions
      await emit(8, 'generate-technical-questions', 'Step 8a: Generating technical questions');
      const techReqs = requirements.filter((r) => r.kind === 'technical');
      const targetTechReqs = techReqs.length > 0 ? techReqs : requirements.slice(0, 3);
      for (const req of targetTechReqs.slice(0, 4)) {
        const qList = await generateQuestionsForRequirement(req, 'technical', genContext, client);
        for (const q of qList) {
          accumulatedQuestions.push(toSharedQuestion(q, req.id, 'technical'));
        }
      }

      // 8b: Behavioural questions
      await emit(8, 'generate-behavioural-questions', 'Step 8b: Generating behavioural questions');
      const behavReqs = requirements.filter((r) => r.kind === 'behavioural');
      const targetBehavReqs = behavReqs.length > 0 ? behavReqs : requirements.slice(0, 2);
      for (const req of targetBehavReqs.slice(0, 3)) {
        const qList = await generateQuestionsForRequirement(req, 'behavioural', genContext, client);
        for (const q of qList) {
          accumulatedQuestions.push(toSharedQuestion(q, req.id, 'behavioural'));
        }
      }

      // 8c: System-design questions
      await emit(8, 'generate-system-design-questions', 'Step 8c: Generating system-design questions');
      const designReqs = requirements.filter((r) => r.priority === 'must' || r.kind === 'technical');
      const targetDesignReq = designReqs[0] ?? requirements[0];
      if (targetDesignReq) {
        const qList = await generateQuestionsForRequirement(targetDesignReq, 'system-design', genContext, client);
        for (const q of qList) {
          accumulatedQuestions.push(toSharedQuestion(q, targetDesignReq.id, 'system-design'));
        }
      }

      // 8d: Company-fit questions
      await emit(8, 'generate-company-fit-questions', 'Step 8d: Generating company-fit questions');
      const firstReq = requirements[0];
      if (firstReq) {
        const qList = await generateQuestionsForRequirement(firstReq, 'company-fit', genContext, client);
        for (const q of qList) {
          accumulatedQuestions.push(toSharedQuestion(q, firstReq.id, 'company-fit'));
        }
      }

      let currentQuestions = deduplicateQuestions(accumulatedQuestions);

      // ────────────────────────────────────────────────────────────────────────
      // Step 9: Generate flashcards linked to requirement IDs
      // ────────────────────────────────────────────────────────────────────────
      await emit(9, 'generate-flashcards', 'Generating flashcards linked to requirement IDs');
      const flashcardOutputs = await generateFlashcards(
        extractedReqs,
        currentQuestions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          requirement_ids: q.requirement_ids,
          category: q.category,
          answer_outline: q.answer_outline,
          difficulty: q.difficulty as 1 | 2 | 3,
        })),
        companyBrief.summary,
        client
      );

      const validReqIds = new Set(requirements.map((r) => r.id));
      const flashcards: Flashcard[] = flashcardOutputs.map((f, i) => {
        // Ensure flashcard references valid requirement IDs
        const filteredReqIds = (f.requirement_ids || []).filter((id) => validReqIds.has(id));
        const finalReqIds = filteredReqIds.length > 0 ? filteredReqIds : [requirements[0]?.id || 'req_core'];
        return {
          id: f.id || `fc_${i + 1}`,
          front: f.front,
          back: f.back,
          requirement_ids: finalReqIds,
        };
      });

      // ────────────────────────────────────────────────────────────────────────
      // Step 10: Run the deterministic coverage checker (Pass 1)
      // ────────────────────────────────────────────────────────────────────────
      await emit(10, 'compute-coverage-pass-1', 'Running deterministic coverage checker (Pass 1)');
      let currentPass = 1;
      let coverageReport: CoverageReport = computeCoverage(requirements, currentQuestions, currentPass);

      logger.info(
        {
          passes: currentPass,
          covered: coverageReport.coveredRequirementIds.length,
          uncoveredMusts: coverageReport.uncoveredMustIds.length,
          mustsCovered: coverageReport.mustsCovered,
        },
        'Pass 1 coverage report'
      );

      // ────────────────────────────────────────────────────────────────────────
      // Steps 11 – 14: Mandatory Coverage Loop for uncovered must-haves
      // ────────────────────────────────────────────────────────────────────────
      while (!coverageReport.mustsCovered && currentPass < maxPasses) {
        currentPass++;

        // Step 11: Identify uncovered must-have requirements
        await emit(
          11,
          `identify-uncovered-musts-pass-${currentPass}`,
          `Pass ${currentPass}: Found ${coverageReport.uncoveredMustIds.length} uncovered must-have requirements`,
          { uncoveredMustIds: coverageReport.uncoveredMustIds }
        );

        const uncoveredMustReqs = extractedReqs.filter((r) =>
          coverageReport.uncoveredMustIds.includes(r.id)
        );

        // Step 12: Generate targeted questions for missing requirements
        await emit(
          12,
          `generate-gap-questions-pass-${currentPass}`,
          `Pass ${currentPass}: Generating targeted questions for missing requirements`
        );

        const gapQuestions = await generateGapQuestions(
          uncoveredMustReqs,
          currentQuestions.map((q) => ({
            id: q.id,
            prompt: q.prompt,
            requirement_ids: q.requirement_ids,
            category: q.category,
            answer_outline: q.answer_outline,
            difficulty: q.difficulty as 1 | 2 | 3,
          })),
          genContext,
          client
        );

        for (const gq of gapQuestions) {
          const reqId = gq.requirement_ids?.[0] || uncoveredMustReqs[0]?.id || requirements[0]?.id || 'req_core';
          currentQuestions.push(toSharedQuestion(gq, reqId, gq.category || 'technical'));
        }

        currentQuestions = deduplicateQuestions(currentQuestions);

        // Step 13 & 14: Re-run coverage checker
        await emit(
          13,
          `recompute-coverage-pass-${currentPass}`,
          `Pass ${currentPass}: Re-computing coverage`
        );
        coverageReport = computeCoverage(requirements, currentQuestions, currentPass);
      }

      await emit(14, 'coverage-loop-finished', `Coverage pass loop finished after ${currentPass} passes`, {
        mustsCovered: coverageReport.mustsCovered,
        uncoveredCount: coverageReport.uncoveredRequirementIds.length,
      });

      // ────────────────────────────────────────────────────────────────────────
      // Step 15: If requirements remain uncovered after final pass, write
      //          an explicit gap analysis into kit metadata
      // ────────────────────────────────────────────────────────────────────────
      let gapAnalysis: string | undefined;
      if (coverageReport.uncoveredRequirementIds.length > 0) {
        const uncoveredReqDetails = requirements
          .filter((r) => coverageReport.uncoveredRequirementIds.includes(r.id))
          .map((r) => `- [${r.priority.toUpperCase()}] ${r.id}: ${r.text} (${r.kind})`)
          .join('\n');

        gapAnalysis =
          `Coverage Gap Analysis (${currentPass} passes completed):\n` +
          `${coverageReport.uncoveredRequirementIds.length} requirement(s) remained uncovered by generated questions:\n` +
          `${uncoveredReqDetails}\n\n` +
          `Recommendation: Review these areas through candidate project history or portfolio evaluation.`;

        await emit(15, 'gap-analysis', 'Recorded explicit gap analysis for uncovered requirements', {
          uncoveredCount: coverageReport.uncoveredRequirementIds.length,
        });
      } else {
        await emit(15, 'gap-analysis', '100% coverage achieved across all requirements; no gap analysis needed');
      }

      const coverage = toCoverageSchema(coverageReport, gapAnalysis);

      // ────────────────────────────────────────────────────────────────────────
      // Step 16: Generate the preparation plan structured by days available
      // ────────────────────────────────────────────────────────────────────────
      await emit(16, 'generate-schedule', `Structuring prep schedule across ${normalizedInput.daysAvailable} days`);

      // Ensure every question has valid requirement references before scheduling
      currentQuestions = currentQuestions.map((q) => {
        const validIds = q.requirement_ids.filter((id) => validReqIds.has(id));
        return {
          ...q,
          requirement_ids: validIds.length > 0 ? validIds : [requirements[0]?.id || 'req_core'],
        };
      });

      const { schedule } = generateSchedule({
        requirements,
        questions: currentQuestions,
        daysAvailable: normalizedInput.daysAvailable,
        minutesPerDay: 180,
      });

      // ────────────────────────────────────────────────────────────────────────
      // Step 17: Emit progress events at every step & Finalize Kit
      //          (Complete kit saved only when pipeline finishes successfully)
      // ────────────────────────────────────────────────────────────────────────
      await emit(17, 'finalize-kit', 'Validating and finalizing complete interview prep kit');

      const kitCandidate: Kit = {
        source,
        company_brief: companyBrief,
        role,
        requirements,
        questions: currentQuestions,
        flashcards,
        schedule,
        coverage,
      };

      // Strict validation
      const schemaCheck = validateKit(kitCandidate);
      if (!schemaCheck.success) {
        const errorMsgs = schemaCheck.errors.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
        throw new Error(`Kit schema validation failed: ${errorMsgs.join('; ')}`);
      }

      const refCheck = validateKitReferences(schemaCheck.data);
      if (!refCheck.valid) {
        throw new Error(`Kit reference integrity check failed: ${refCheck.errors.join('; ')}`);
      }

      return {
        kit: schemaCheck.data,
        passes: currentPass,
        uncoveredMustCount: coverageReport.uncoveredMustIds.length,
        gapAnalysis,
      };
    };

    if (options.deduplicate ?? true) {
      const fingerprint = idempotencyManager.generateFingerprint({
        jobDescription: normalizedInput.jobDescription,
        companyUrl: normalizedInput.companyUrl,
        daysAvailable: normalizedInput.daysAvailable,
      });
      return idempotencyManager.runDeduplicated(fingerprint, runner);
    }

    return runner();
  }
}

function extractCompanyName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const clean = hostname.replace(/^www\./i, '');
    const part = clean.split('.')[0] || 'Company';
    return part.charAt(0).toUpperCase() + part.slice(1);
  } catch {
    return 'Company';
  }
}

function toSharedQuestion(
  raw: any,
  fallbackReqId: string,
  category: 'technical' | 'behavioural' | 'system-design' | 'company-fit'
): Question {
  const reqIds = Array.isArray(raw.requirement_ids) && raw.requirement_ids.length > 0
    ? raw.requirement_ids
    : [fallbackReqId];

  let diff = Number(raw.difficulty);
  if (isNaN(diff) || diff < 1 || diff > 3) {
    diff = 2;
  }

  const id = raw.id || `q_${Math.random().toString(36).slice(2, 9)}`;

  return {
    id,
    requirement_ids: reqIds,
    category: (raw.category as any) || category,
    prompt: raw.prompt || 'Explain your technical approach.',
    answer_outline: raw.answer_outline || '',
    difficulty: diff as 1 | 2 | 3,
  };
}

export const orchestrator = new PipelineOrchestrator();
