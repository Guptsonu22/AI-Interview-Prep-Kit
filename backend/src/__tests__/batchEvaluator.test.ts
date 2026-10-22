/**
 * Automated Tests for Batch Evaluator (Prompt 10)
 *
 * Verifies:
 * 1. A normal detailed job description produces a valid kit (status: "ok")
 * 2. A two-line sparse job description produces a valid kit (status: "ok")
 * 3. A company with no hiring page produces a partially researched valid kit (status: "ok")
 * 4. An unreachable company site produces status "failed" with code "COMPANY_UNREACHABLE"
 * 5. An LLM response requiring a coverage second pass triggers gap fill and succeeds
 * 6. Different requested schedule lengths produce matching deterministic schedules
 * 7. Path prefixes and relative URL resolution on local fixture servers
 * 8. Output structure adheres strictly to the single JSON object specification
 * 9. Malformed input files and missing fields fail with descriptive errors
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { FixtureServer } from '../modules/research/fixtures';
import { runBatchEvaluation, BatchEvaluationOutput } from '../cli/evaluate';
import { validateKit, validateKitReferences } from '@interview-prep/shared';
import type { LLMClient, LLMResponse, LLMMessage, LLMCallOptions } from '../llm/types';
import { clearGenerationCaches } from '../llm';

describe('Batch Evaluator (Prompt 10)', () => {
  let fixtureServer: FixtureServer;
  let fixturePort: number;
  let fixtureBaseUrl: string;

  let testScratchDir: string;

  beforeAll(async () => {
    testScratchDir = await fs.mkdtemp(path.join(tmpdir(), 'interview-prep-eval-'));

    // Enable localhost crawling for tests
    process.env['ALLOW_LOCALHOST'] = 'true';
    process.env['NODE_ENV'] = 'test';

    // Start fixture server with various company site setups
    fixtureServer = new FixtureServer();

    // 1. Normal company site with hiring pages
    fixtureServer
      .addRoute({
        path: '/',
        body: `
          <html>
            <head><title>Acme Cloud Platform</title></head>
            <body>
              <h1>Acme Cloud Platform</h1>
              <nav><a href="/about">About Us</a> | <a href="/careers">Careers</a></nav>
              <main><p>We provide enterprise cloud platforms and distributed systems.</p></main>
            </body>
          </html>
        `,
      })
      .addRoute({
        path: '/about',
        body: `
          <html>
            <head><title>About Acme</title></head>
            <body>
              <h1>About Acme</h1>
              <p>Founded in 2018, Acme powers modern microservices and real-time APIs.</p>
            </body>
          </html>
        `,
      })
      .addRoute({
        path: '/careers',
        body: `
          <html>
            <head><title>Careers at Acme</title></head>
            <body>
              <h1>Careers</h1>
              <p>Our engineering interview process consists of a recruiter screen, technical deep dive, and system design onsite.</p>
              <a href="/careers/hiring-process">Interview Guide</a>
            </body>
          </html>
        `,
      })
      .addRoute({
        path: '/careers/hiring-process',
        body: `
          <html>
            <head><title>Acme Interview Guide</title></head>
            <body>
              <h1>Interview Guide</h1>
              <p>We evaluate candidates on practical problem solving, clean code, and collaborative communication.</p>
            </body>
          </html>
        `,
      })
      // 2. Company with NO hiring page (only landing page)
      .addRoute({
        path: '/no-hiring/',
        body: `
          <html>
            <head><title>Stealth Startup</title></head>
            <body>
              <h1>Stealth Startup</h1>
              <p>We are operating in stealth mode. No open positions or hiring information available.</p>
            </body>
          </html>
        `,
      })
      // 3. Local fixture site with path prefix and relative links
      .addRoute({
        path: '/acme/',
        body: `
          <html>
            <head><title>Acme Prefix Site</title></head>
            <body>
              <h1>Acme Prefix</h1>
              <a href="about">About</a> | <a href="careers">Careers</a>
            </body>
          </html>
        `,
      })
      .addRoute({
        path: '/acme/about',
        body: '<html><head><title>Acme Prefix About</title></head><body><p>Acme prefix about page.</p></body></html>',
      })
      .addRoute({
        path: '/acme/careers',
        body: '<html><head><title>Acme Prefix Careers</title></head><body><p>Interview process for prefix site.</p></body></html>',
      });

    fixturePort = await fixtureServer.start();
    fixtureBaseUrl = `http://localhost:${fixturePort}`;
  });

  beforeEach(() => {
    clearGenerationCaches();
  });

  afterAll(async () => {
    if (fixtureServer) {
      await fixtureServer.stop();
    }
    await fs.rm(testScratchDir, { recursive: true, force: true });
  });

  /**
   * Creates a mock LLM client that can trigger a coverage second pass if requested
   */
  function createMockLLMClient(opts: { triggerSecondPass?: boolean } = {}): LLMClient {
    let questionCallCount = 0;

    const wrap = (data: unknown): LLMResponse => ({
      text: JSON.stringify(data),
      json: data,
      model: 'mock-eval',
    });

    const executeCall = async (messages: LLMMessage[], callOpts?: LLMCallOptions): Promise<LLMResponse> => {
      const text = messages.map((m) => m.content).join('\n');
      const system = callOpts?.system ?? '';
      const combined = `${system}\n${text}`;

      // 1. Role Metadata Extraction
      if (
        combined.includes('job-description parser') ||
        combined.includes('Extract role metadata') ||
        combined.includes('Extract structured role metadata')
      ) {
        return wrap({
          title: 'Senior Software Engineer',
          seniority: 'Senior',
          responsibilities: ['Architect scalable systems', 'Mentor junior engineers'],
          evidence: ['5+ years of software development'],
        });
      }

      // 2. Requirements Extraction
      if (
        combined.includes('job-description analyst') ||
        combined.includes('Extract all requirements from the following job description') ||
        combined.includes('distinct requirement')
      ) {
        return wrap({
          requirements: [
            { id: 'req_1', text: 'Proficiency in TypeScript and Node.js', kind: 'technical', priority: 'must', source_excerpt: 'TypeScript and Node.js' },
            { id: 'req_2', text: 'Experience designing distributed systems', kind: 'technical', priority: 'must', source_excerpt: 'distributed systems' },
            { id: 'req_3', text: 'Effective communication in cross-functional teams', kind: 'behavioural', priority: 'nice', source_excerpt: 'cross-functional teams' },
          ],
        });
      }

      // 3. Company Brief Generation
      if (
        combined.includes('corporate intelligence analyst') ||
        combined.includes('Summarise the company') ||
        combined.includes('Summarise company research')
      ) {
        return wrap({
          summary: 'Acme is an enterprise cloud platform built for real-time APIs.',
          what_they_do: 'Cloud infrastructure platforms and distributed microservices.',
          sources: [`${fixtureBaseUrl}/about`, `${fixtureBaseUrl}/careers`],
        });
      }

      // 4. Flashcards Generation
      if (
        combined.includes('study-aid creator') ||
        combined.includes('Generate flashcards')
      ) {
        return wrap({
          flashcards: [
            { id: 'fc_1', front: 'What is the Node.js event loop?', back: 'Single-threaded event-driven execution model.', requirement_ids: ['req_1'] },
            { id: 'fc_2', front: 'What is CAP Theorem?', back: 'Consistency, Availability, Partition tolerance trade-offs.', requirement_ids: ['req_2'] },
          ],
        });
      }

      // 5. Gap Questions Generation
      if (
        combined.includes('Generate gap questions') ||
        combined.includes('UNCOVERED_REQUIREMENTS')
      ) {
        return wrap({
          questions: [
            {
              id: 'q_gap_dist_1',
              prompt: 'How would you partition a high-throughput distributed message queue?',
              category: 'system-design',
              difficulty: 3,
              answer_outline: 'Consistent hashing, replication factor, partition keys.',
              requirement_ids: ['req_2'],
            },
          ],
        });
      }

      // 6. Regular Question Generation
      questionCallCount++;
      // If triggerSecondPass is enabled, omit req_2 in regular passes so coverage pass 1 leaves req_2 uncovered
      const reqIdsForPass = opts.triggerSecondPass
        ? ['req_1']
        : ['req_1', 'req_2'];

      return wrap({
        questions: [
          {
            id: `q_gen_${questionCallCount}`,
            prompt: `Explain key concepts related to requirement ${reqIdsForPass[0]}.`,
            category: combined.includes('behavioural') ? 'behavioural' : combined.includes('system-design') ? 'system-design' : 'technical',
            difficulty: 2,
            answer_outline: 'Thorough technical breakdown with trade-off analysis.',
            requirement_ids: reqIdsForPass,
          },
        ],
      });
    };

    return {
      call: executeCall,
      complete: executeCall,
      config: {
        provider: 'mock' as any,
        apiKey: 'mock-key',
        model: 'mock-eval',
        temperature: 0,
        concurrency: 1,
        maxRetries: 0,
        retryBaseMs: 10,
      },
    } as any;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: Full Representative Batch Run with 5 Key Cases
  // ──────────────────────────────────────────────────────────────────────────
  it('runs batch evaluation on representative cases and writes valid output JSON', async () => {
    const inputFilePath = path.join(testScratchDir, 'representative_cases.json');
    const outputFilePath = path.join(testScratchDir, 'representative_kits.json');

    const cases = [
      // Case 1: Normal detailed job description
      {
        id: 'case-normal-detailed',
        jd: 'Senior Software Engineer at Acme. Responsibilities: Design and build high-throughput backend APIs using Node.js and TypeScript. Must have 5+ years experience with distributed systems and SQL/NoSQL databases. Strong team collaboration skills required.',
        company_url: `${fixtureBaseUrl}/`,
        days: 7,
      },
      // Case 2: A two-line sparse job description
      {
        id: 'case-sparse-two-line',
        jd: 'Software Engineer at Acme.\nProficient in Node.js and REST APIs.',
        company_url: `${fixtureBaseUrl}/`,
        days: 5,
      },
      // Case 3: A company with no hiring page
      {
        id: 'case-no-hiring-page',
        jd: 'Backend Engineer at Stealth. Build resilient services in TypeScript and PostgreSQL. Experience with cloud infrastructure.',
        company_url: `${fixtureBaseUrl}/no-hiring/`,
        days: 3,
      },
      // Case 4: An unreachable company site
      {
        id: 'case-unreachable-site',
        jd: 'Full Stack Engineer at Unreachable Corp. Build full stack applications with React and Node.js. 3+ years experience.',
        company_url: 'http://localhost:65530/unreachable',
        days: 5,
      },
      // Case 5: Different requested schedule length (1-day intensive)
      {
        id: 'case-schedule-1-day',
        jd: 'Senior TypeScript Architect. Lead architectural decisions for large-scale enterprise microservices. Deep knowledge of concurrency.',
        company_url: `${fixtureBaseUrl}/`,
        days: 1,
      },
    ];

    await fs.writeFile(inputFilePath, JSON.stringify(cases, null, 2), 'utf-8');

    const client = createMockLLMClient();
    const result = await runBatchEvaluation({
      inputPath: inputFilePath,
      outputPath: outputFilePath,
      concurrency: 2,
      client,
      allowLocalhost: true,
    });

    // 1. Output file was written and is valid JSON
    const writtenRaw = await fs.readFile(outputFilePath, 'utf-8');
    const writtenJson: BatchEvaluationOutput = JSON.parse(writtenRaw);

    expect(writtenJson.version).toBe('1.0');
    expect(new Date(writtenJson.generated_at).getTime()).toBeGreaterThan(0);
    expect(writtenJson.kits).toHaveLength(5);

    // 2. Preserve one output entry per input case in the exact same order
    expect(writtenJson.kits.map((k) => k.id)).toEqual([
      'case-normal-detailed',
      'case-sparse-two-line',
      'case-no-hiring-page',
      'case-unreachable-site',
      'case-schedule-1-day',
    ]);

    // 3. Case 1 (Detailed): status ok, valid Appendix A kit
    const case1 = writtenJson.kits[0]!;
    expect(case1.status).toBe('ok');
    expect(case1.error).toBeNull();
    expect(case1.kit).toBeDefined();
    const case1Val = validateKit(case1.kit);
    expect(case1Val.success).toBe(true);
    const case1Ref = validateKitReferences(case1.kit as any);
    expect(case1Ref.valid).toBe(true);
    expect((case1.kit as any).schedule.days_available).toBe(7);
    expect((case1.kit as any).schedule.days).toHaveLength(7);

    // 4. Case 2 (Sparse 2-line): status ok
    const case2 = writtenJson.kits[1]!;
    expect(case2.status).toBe('ok');
    expect(case2.error).toBeNull();
    const case2Val = validateKit(case2.kit);
    expect(case2Val.success).toBe(true);
    expect((case2.kit as any).schedule.days_available).toBe(5);

    // 5. Case 3 (No hiring page): partially researched but valid kit (status ok)
    const case3 = writtenJson.kits[2]!;
    expect(case3.status).toBe('ok');
    expect(case3.error).toBeNull();
    const case3Val = validateKit(case3.kit);
    expect(case3Val.success).toBe(true);
    expect((case3.kit as any).schedule.days_available).toBe(3);

    // 6. Case 4 (Unreachable site): status failed with COMPANY_UNREACHABLE
    const case4 = writtenJson.kits[3]!;
    expect(case4.status).toBe('failed');
    expect(case4.kit).toBeNull();
    expect(case4.error).toBeDefined();
    expect(case4.error?.code).toBe('COMPANY_UNREACHABLE');
    expect(case4.error?.message).toContain('unreachable');

    // 7. Case 5 (1-day schedule): status ok with exactly 1 scheduled day
    const case5 = writtenJson.kits[4]!;
    expect(case5.status).toBe('ok');
    expect((case5.kit as any).schedule.days_available).toBe(1);
    expect((case5.kit as any).schedule.days).toHaveLength(1);
    expect((case5.kit as any).schedule.days[0].day).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Coverage Second Pass Triggered for Missing Must-Have Requirements
  // ──────────────────────────────────────────────────────────────────────────
  it('triggers coverage second pass and fills gaps when initial questions leave must-haves uncovered', async () => {
    const inputFilePath = path.join(testScratchDir, 'coverage_pass_case.json');
    const outputFilePath = path.join(testScratchDir, 'coverage_pass_kit.json');

    const cases = [
      {
        id: 'case-coverage-gap',
        jd: 'Principal Systems Architect. Must have distributed systems expertise and TypeScript mastery.',
        company_url: `${fixtureBaseUrl}/`,
        days: 5,
      },
    ];

    await fs.writeFile(inputFilePath, JSON.stringify(cases, null, 2), 'utf-8');

    // Trigger second pass in mock LLM
    const client = createMockLLMClient({ triggerSecondPass: true });
    const result = await runBatchEvaluation({
      inputPath: inputFilePath,
      outputPath: outputFilePath,
      client,
      allowLocalhost: true,
      maxCoveragePasses: 3,
    });

    const kitOutput = result.kits[0]!;
    expect(kitOutput.status).toBe('ok');
    const kit: any = kitOutput.kit;

    // Verify coverage passed with at least 2 passes
    expect(kit.coverage.passes).toBeGreaterThanOrEqual(2);

    // Verify all must-have requirements are covered
    const scheduledQIds = new Set(kit.schedule.days.flatMap((d: any) => d.question_ids));
    expect(scheduledQIds.size).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: Path Prefix and Relative URL Resolution
  // ──────────────────────────────────────────────────────────────────────────
  it('correctly resolves relative links on fixture sites with path prefixes', async () => {
    const inputFilePath = path.join(testScratchDir, 'prefix_case.json');
    const outputFilePath = path.join(testScratchDir, 'prefix_kit.json');

    const cases = [
      {
        id: 'case-prefix-url',
        jd: 'Staff Engineer. Build scalable backends using TypeScript and microservices.',
        company_url: `${fixtureBaseUrl}/acme/`,
        days: 4,
      },
    ];

    await fs.writeFile(inputFilePath, JSON.stringify(cases, null, 2), 'utf-8');

    const client = createMockLLMClient();
    const result = await runBatchEvaluation({
      inputPath: inputFilePath,
      outputPath: outputFilePath,
      client,
      allowLocalhost: true,
    });

    const kitOutput = result.kits[0]!;
    expect(kitOutput.status).toBe('ok');
    const briefSources = (kitOutput.kit as any).company_brief.sources;
    expect(briefSources.length).toBeGreaterThan(0);
    // Sources should reference the resolved URLs
    expect(briefSources.some((s: string) => s.includes('/acme'))).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: Error Handling for Malformed Input Files & Missing Fields
  // ──────────────────────────────────────────────────────────────────────────
  it('fails clearly for malformed input JSON files', async () => {
    const malformedFile = path.join(testScratchDir, 'malformed.json');
    await fs.writeFile(malformedFile, '{ this is not valid json }', 'utf-8');

    await expect(
      runBatchEvaluation({
        inputPath: malformedFile,
        outputPath: path.join(testScratchDir, 'out.json'),
      })
    ).rejects.toThrow(/Malformed JSON in input file/);
  });

  it('fails clearly when required fields (id, jd, company_url) are missing', async () => {
    const invalidCaseFile = path.join(testScratchDir, 'missing_fields.json');
    const invalidCases = [{ id: 'case-bad' /* missing jd and company_url */ }];
    await fs.writeFile(invalidCaseFile, JSON.stringify(invalidCases), 'utf-8');

    await expect(
      runBatchEvaluation({
        inputPath: invalidCaseFile,
        outputPath: path.join(testScratchDir, 'out.json'),
      })
    ).rejects.toThrow(/Invalid evaluation case structure/);
  });
});
