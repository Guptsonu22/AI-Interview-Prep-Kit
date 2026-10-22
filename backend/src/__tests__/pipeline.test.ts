/**
 * Tests for the End-to-End Generation Pipeline Orchestration
 *
 * Covers:
 *  1. Input validation & normalization (JD & company URL)
 *  2. Deterministic coverage checker
 *  3. In-flight deduplication & idempotency
 *  4. 17-step Pipeline Orchestrator (with mocked LLM client & mock pages)
 *  5. Mandatory coverage second pass for uncovered must-haves
 *  6. Gap analysis written to metadata when requirements remain uncovered
 *  7. Preparation plan structured by days available
 *  8. Reference integrity validation (validateKitReferences)
 *  9. CLI evaluatePipeline integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PipelineOrchestrator,
  computeCoverage,
  toCoverageSchema,
  findUncoveredRequirements,
  deduplicateQuestions,
  findOrphanedQuestions,
  normalizeJobDescription,
  normalizeCompanyUrl,
  validateAndNormalizeInput,
  idempotencyManager,
  type PipelineProgressEvent,
} from '../pipeline';
import { runEvaluationPipeline } from '../cli/evaluatePipeline';
import { validateKit, validateKitReferences } from '@interview-prep/shared';
import type { LLMClient, LLMResponse, LLMMessage, LLMCallOptions } from '../llm/types';
import { clearGenerationCaches } from '../llm';

describe('Pipeline Normalization', () => {
  beforeEach(() => {
    clearGenerationCaches();
  });
  it('normalizes job descriptions (newlines, control characters, extra whitespace)', () => {
    const raw = '  \r\n\r\nSenior TypeScript Engineer\r\n\r\n\r\n\r\nResponsibilities:\x00\x08\n- Build high scale APIs\u00A0with Node.js   \n\n\n\nRequirements: 5+ years experience.   ';
    const normalized = normalizeJobDescription(raw);

    expect(normalized).not.toContain('\r');
    expect(normalized).not.toContain('\x00');
    expect(normalized).not.toContain('\u00A0');
    expect(normalized).not.toContain('\n\n\n');
    expect(normalized.startsWith('Senior TypeScript Engineer')).toBe(true);
    expect(normalized.endsWith('5+ years experience.')).toBe(true);
  });

  it('normalizes company URLs (missing protocol, casing, tracking params, trailing slashes)', () => {
    const raw = 'GOOGLE.COM/?utm_source=twitter&utm_medium=cpc&ref=xyz#section1';
    const normalized = normalizeCompanyUrl(raw);

    expect(normalized).toBe('https://google.com');
  });

  it('validates and normalizes valid pipeline input', () => {
    const input = {
      jobDescription: 'A'.repeat(150),
      companyUrl: 'stripe.com/jobs',
      daysAvailable: 10,
      userId: 'user_123',
    };

    const result = validateAndNormalizeInput(input);
    expect(result.jobDescription.length).toBe(150);
    expect(result.companyUrl).toBe('https://stripe.com/jobs');
    expect(result.daysAvailable).toBe(10);
    expect(result.userId).toBe('user_123');
  });

  it('supports prepDays alias for daysAvailable', () => {
    const input = {
      jobDescription: 'B'.repeat(120),
      companyUrl: 'https://acme.org',
      prepDays: 14,
    };

    const result = validateAndNormalizeInput(input);
    expect(result.daysAvailable).toBe(14);
  });

  it('rejects job descriptions that are too short after normalization', () => {
    expect(() => {
      validateAndNormalizeInput({
        jobDescription: '   Short JD   ',
        companyUrl: 'https://acme.org',
        daysAvailable: 5,
      });
    }).toThrow(/too short/i);
  });
});

describe('Deterministic Coverage Checker', () => {
  const reqs = [
    { id: 'req_ts', text: 'TypeScript', kind: 'technical' as const, priority: 'must' as const },
    { id: 'req_node', text: 'Node.js', kind: 'technical' as const, priority: 'must' as const },
    { id: 'req_comm', text: 'Communication', kind: 'behavioural' as const, priority: 'nice' as const },
  ];

  it('reports mustsCovered: false when a must requirement is missing', () => {
    const questions = [
      {
        id: 'q1',
        requirement_ids: ['req_ts'],
        category: 'technical' as const,
        prompt: 'TS question',
        answer_outline: '',
        difficulty: 2 as const,
      },
    ];

    const report = computeCoverage(reqs, questions, 1);
    expect(report.mustsCovered).toBe(false);
    expect(report.uncoveredMustIds).toEqual(['req_node']);
    expect(report.uncoveredRequirementIds).toEqual(['req_node', 'req_comm']);
    expect(report.coverageRatio).toBeCloseTo(1 / 3);
  });

  it('reports mustsCovered: true when all must requirements are referenced', () => {
    const questions = [
      {
        id: 'q1',
        requirement_ids: ['req_ts'],
        category: 'technical' as const,
        prompt: 'TS question',
        answer_outline: '',
        difficulty: 2 as const,
      },
      {
        id: 'q2',
        requirement_ids: ['req_node'],
        category: 'technical' as const,
        prompt: 'Node question',
        answer_outline: '',
        difficulty: 2 as const,
      },
    ];

    const report = computeCoverage(reqs, questions, 1);
    expect(report.mustsCovered).toBe(true);
    expect(report.uncoveredMustIds).toEqual([]);
    expect(report.uncoveredRequirementIds).toEqual(['req_comm']); // nice-to-have still uncovered
  });

  it('toCoverageSchema attaches gap_analysis when present', () => {
    const report = computeCoverage(reqs, [], 2);
    const schema = toCoverageSchema(report, 'Explicit gap note');

    expect(schema.passes).toBe(2);
    expect(schema.uncovered_requirement_ids.length).toBe(3);
    expect(schema.gap_analysis).toBe('Explicit gap note');
  });

  it('deduplicates questions by prompt and category', () => {
    const questions = [
      { id: 'q1', requirement_ids: ['req_ts'], category: 'technical' as const, prompt: 'How does event loop work?', answer_outline: '', difficulty: 2 as const },
      { id: 'q2', requirement_ids: ['req_node'], category: 'technical' as const, prompt: '  HOW DOES EVENT LOOP WORK?  ', answer_outline: '', difficulty: 2 as const },
      { id: 'q3', requirement_ids: ['req_ts'], category: 'behavioural' as const, prompt: 'Tell me about a bug you fixed', answer_outline: '', difficulty: 1 as const },
    ];

    const deduped = deduplicateQuestions(questions);
    expect(deduped.length).toBe(2);
    expect(deduped[0]?.id).toBe('q1');
    expect(deduped[1]?.id).toBe('q3');
  });
});

describe('Pipeline Idempotency Manager', () => {
  beforeEach(() => {
    idempotencyManager.clear();
  });

  it('generates identical fingerprints for identical inputs', () => {
    const fp1 = idempotencyManager.generateFingerprint({
      jobDescription: 'Senior Software Engineer with TypeScript and React experience',
      companyUrl: 'https://example.com',
      daysAvailable: 7,
    });
    const fp2 = idempotencyManager.generateFingerprint({
      jobDescription: 'Senior Software Engineer with TypeScript and React experience',
      companyUrl: 'https://example.com',
      daysAvailable: 7,
    });
    expect(fp1).toBe(fp2);
  });

  it('shares in-flight promise for concurrent requests with identical key', async () => {
    let callCount = 0;
    const task = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 20));
      return { kit: {} as any, passes: 1, uncoveredMustCount: 0 };
    };

    const p1 = idempotencyManager.runDeduplicated('key1', task);
    const p2 = idempotencyManager.runDeduplicated('key1', task);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
    expect(callCount).toBe(1);
  });
});

describe('Pipeline Orchestrator End-to-End', () => {
  function makeMockPipelineClient(options: { coveragePassesNeeded?: number } = {}): LLMClient {
    let callCount = 0;
    const passesNeeded = options.coveragePassesNeeded ?? 1;

    return {
      config: {
        provider: 'gemini' as const,
        apiKey: 'test',
        model: 'gemini-1.5-flash',
        temperature: 0,
        concurrency: 2,
        maxRetries: 0,
        retryBaseMs: 0,
      },
      call: vi.fn(async (msgs: LLMMessage[], _opts?: LLMCallOptions): Promise<LLMResponse> => {
        callCount++;
        const content = msgs.map((m) => m.content).join(' ');

        // 1. Requirements extraction
        if (content.includes('Extract all requirements')) {
          return {
            text: '',
            json: {
              requirements: [
                {
                  id: 'req_ts',
                  text: 'TypeScript mastery required',
                  kind: 'technical',
                  priority: 'must',
                  source_excerpt: 'Must have strong TypeScript experience.',
                },
                {
                  id: 'req_sys_design',
                  text: 'Distributed systems architecture',
                  kind: 'technical',
                  priority: 'must',
                  source_excerpt: 'Architect distributed systems.',
                },
                {
                  id: 'req_mentoring',
                  text: 'Mentoring junior engineers',
                  kind: 'behavioural',
                  priority: 'nice',
                  source_excerpt: 'Mentoring experience preferred.',
                },
              ],
            },
            model: 'test',
          };
        }

        // 2. Role metadata
        if (content.includes('Extract role metadata')) {
          return {
            text: '',
            json: {
              title: 'Staff Software Engineer',
              seniority: 'Senior',
              location: 'San Francisco, CA',
              experience: '5+ years',
              responsibilities: ['Design backend architecture', 'Lead technical initiatives'],
              evidence: ['Must have 5+ years experience'],
            },
            model: 'test',
          };
        }

        // 3. Company brief
        if (content.includes('Summarise the company')) {
          return {
            text: '',
            json: {
              summary: 'Acme builds global payment infrastructure.',
              what_they_do: 'Payment processing software and developer APIs.',
              sources: ['https://example.com/about'],
              unverified_fields: [],
            },
            model: 'test',
          };
        }

        // 4. Questions generation (initial pass)
        if (content.includes('Generate technical questions') || content.includes('Generate behavioural questions') || content.includes('Generate system-design questions') || content.includes('Generate company-fit questions')) {
          // If 2 passes needed, deliberately only cover req_ts in pass 1 so req_sys_design is uncovered
          const reqIdToCover = passesNeeded > 1 ? 'req_ts' : 'req_ts';

          return {
            text: '',
            json: {
              questions: [
                {
                  id: `q_test_${callCount}`,
                  requirement_ids: [reqIdToCover],
                  category: 'technical',
                  prompt: `Explain deep concepts relating to call ${callCount}`,
                  answer_outline: 'Outline answer with trade-offs.',
                  difficulty: 2,
                },
              ],
            },
            model: 'test',
          };
        }

        // 5. Gap questions generation
        if (content.includes('Generate gap questions')) {
          return {
            text: '',
            json: {
              questions: [
                {
                  id: `q_gap_${callCount}`,
                  requirement_ids: ['req_sys_design'],
                  category: 'technical',
                  prompt: 'Explain how you design fault-tolerant distributed systems.',
                  answer_outline: 'Leader election, quorum, partitions.',
                  difficulty: 3,
                },
              ],
            },
            model: 'test',
          };
        }

        // 6. Flashcards
        if (content.includes('Generate flashcards')) {
          return {
            text: '',
            json: {
              flashcards: [
                {
                  id: 'fc_ts_generics',
                  front: 'What are conditional types in TypeScript?',
                  back: 'Types that depend on a condition: T extends U ? X : Y',
                  requirement_ids: ['req_ts'],
                },
              ],
            },
            model: 'test',
          };
        }

        return { text: '{}', json: {}, model: 'test' };
      }),
    };
  }

  const sampleJD = `
    Staff Software Engineer, Platform Infrastructure
    Location: San Francisco, CA
    About the role:
    We are looking for a Staff Software Engineer to lead platform architecture.
    Required qualifications:
    - Must have strong TypeScript experience.
    - Architect distributed systems at scale.
    - Strong problem solving and communication skills.
    Preferred:
    - Mentoring junior engineers.
  `.trim();

  it('executes full 17-step pipeline successfully with progress events', async () => {
    const orchestrator = new PipelineOrchestrator();
    const mockClient = makeMockPipelineClient({ coveragePassesNeeded: 1 });
    const events: PipelineProgressEvent[] = [];

    const result = await orchestrator.execute(
      {
        jobDescription: sampleJD,
        companyUrl: 'https://acme-payments.example.com',
        daysAvailable: 5,
        userId: 'candidate_1',
      },
      {
        client: mockClient,
        mockCompanyPages: [
          { url: 'https://acme-payments.example.com/about', text: 'Acme Payments builds next-generation billing.' },
          { url: 'https://acme-payments.example.com/careers', text: 'Our interview process includes coding challenges and system design.' },
        ],
        onProgress: (ev) => events.push(ev),
        deduplicate: false,
      }
    );

    // Verify progress events were emitted
    expect(events.length).toBeGreaterThanOrEqual(10);
    expect(events[0]?.stepName).toBe('validate-input');
    expect(events.some((e) => e.stepName === 'finalize-kit')).toBe(true);

    // Verify Kit structure conforms to schema
    const kit = result.kit;
    const validation = validateKit(kit);
    expect(validation.success).toBe(true);

    // Verify reference integrity
    const refValidation = validateKitReferences(kit);
    expect(refValidation.valid).toBe(true);
    expect(refValidation.errors).toEqual([]);

    // Verify schedule structured across daysAvailable (5 days)
    expect(kit.schedule.days_available).toBe(5);
    expect(kit.schedule.days.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(kit.schedule.days[i]?.day).toBe(i + 1);
      expect(kit.schedule.days[i]?.minutes).toBeGreaterThan(0);
    }
  });

  it('triggers mandatory coverage second pass when must-haves are uncovered on pass 1', async () => {
    const orchestrator = new PipelineOrchestrator();
    // Simulate coveragePassesNeeded: 2 (req_sys_design uncovered in pass 1, covered in pass 2)
    const mockClient = makeMockPipelineClient({ coveragePassesNeeded: 2 });
    const events: PipelineProgressEvent[] = [];

    const result = await orchestrator.execute(
      {
        jobDescription: sampleJD,
        companyUrl: 'https://acme-payments.example.com',
        daysAvailable: 7,
      },
      {
        client: mockClient,
        mockCompanyPages: [
          { url: 'https://acme-payments.example.com/about', text: 'Acme Payments software.' },
        ],
        onProgress: (ev) => events.push(ev),
        deduplicate: false,
      }
    );

    // Pass count must be at least 2
    expect(result.passes).toBeGreaterThanOrEqual(2);
    expect(events.some((e) => e.stepName.includes('pass-2'))).toBe(true);

    // Both must-haves (req_ts and req_sys_design) must now be covered
    const referenced = new Set(result.kit.questions.flatMap((q) => q.requirement_ids));
    expect(referenced.has('req_ts')).toBe(true);
    expect(referenced.has('req_sys_design')).toBe(true);
  });

  it('writes explicit gap analysis into kit metadata when uncovered requirements remain', async () => {
    const orchestrator = new PipelineOrchestrator();
    // Client that never covers req_sys_design, with maxCoveragePasses capped at 2
    const failingMockClient: LLMClient = {
      config: {
        provider: 'gemini' as const,
        apiKey: 'test',
        model: 'test',
        temperature: 0,
        concurrency: 1,
        maxRetries: 0,
        retryBaseMs: 0,
      },
      call: vi.fn(async (msgs: LLMMessage[]) => {
        const content = msgs.map((m) => m.content).join(' ');
        if (content.includes('Extract all requirements')) {
          return {
            text: '',
            json: {
              requirements: [
                { id: 'req_must_1', text: 'Must Skill A', kind: 'technical', priority: 'must', source_excerpt: 'Req A' },
                { id: 'req_must_uncovered', text: 'Uncovered Skill', kind: 'technical', priority: 'must', source_excerpt: 'Req B' },
              ],
            },
            model: 'test',
          };
        }
        if (content.includes('Extract role metadata')) {
          return { text: '', json: { title: 'Developer', seniority: 'Mid', responsibilities: [], evidence: [] }, model: 'test' };
        }
        if (content.includes('Summarise the company')) {
          return { text: '', json: { summary: 'Tech Co', what_they_do: 'Software', sources: [], unverified_fields: [] }, model: 'test' };
        }
        if (content.includes('flashcards')) {
          return {
            text: '',
            json: {
              flashcards: [
                { id: 'fc_1', front: 'Explain Concept A in detail', back: 'Detailed explanation of Concept A in practice.', requirement_ids: ['req_must_1'] },
              ],
            },
            model: 'test',
          };
        }
        // Only return questions for req_must_1, never for req_must_uncovered
        if (content.includes('Generate') && content.includes('questions')) {
          return {
            text: '',
            json: {
              questions: [
                { id: `q_${Date.now()}`, requirement_ids: ['req_must_1'], category: 'technical', prompt: 'Question on A', answer_outline: '', difficulty: 2 },
              ],
            },
            model: 'test',
          };
        }
        return { text: '{}', json: {}, model: 'test' };
      }),
    };

    clearGenerationCaches();

    const result = await orchestrator.execute(
      {
        jobDescription: sampleJD + ' UNCOVERED_REQS_TEST',
        companyUrl: 'https://example.com',
        daysAvailable: 3,
      },
      {
        client: failingMockClient,
        maxCoveragePasses: 2,
        mockCompanyPages: [{ url: 'https://example.com', text: 'Company homepage' }],
        deduplicate: false,
      }
    );

    expect(result.kit.coverage.gap_analysis).toBeDefined();
    expect(result.kit.coverage.gap_analysis).toContain('req_must_uncovered');
    expect(result.kit.coverage.uncovered_requirement_ids).toContain('req_must_uncovered');
  });

  it('runEvaluationPipeline works with the shared orchestrator for batch evaluation', async () => {
    const mockClient = makeMockPipelineClient({ coveragePassesNeeded: 1 });

    const evalResult = await runEvaluationPipeline(
      {
        jobDescription: sampleJD,
        companyUrl: 'https://acme.org',
        prepDays: 5,
        userId: 'eval_user',
      },
      {
        client: mockClient,
        mockCompanyPages: [{ url: 'https://acme.org', text: 'Acme about page' }],
      }
    );

    expect(evalResult.kit).toBeDefined();
    expect(evalResult.coverageScore).toBeGreaterThan(0);
    expect(evalResult.errors).toEqual([]);
  });
});
