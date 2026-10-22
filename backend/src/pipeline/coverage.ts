/**
 * Deterministic Coverage Checker
 *
 * Coverage is pure application logic — an LLM never decides whether a
 * requirement is covered.  A requirement counts as covered only if at least
 * one valid question explicitly references its ID in requirement_ids.
 *
 * This module also tracks pass metadata (number of coverage passes run) so
 * diagnostics can show exactly how many iterations were needed.
 */

import type { Requirement, Question, Coverage } from '@interview-prep/shared';

export interface CoverageReport {
  /** IDs of requirements not referenced by any question */
  uncoveredRequirementIds: string[];
  /** IDs of must-have requirements not referenced by any question */
  uncoveredMustIds: string[];
  /** IDs of requirements that ARE referenced */
  coveredRequirementIds: string[];
  /** 0.0 – 1.0 fraction of all requirements covered */
  coverageRatio: number;
  /** 0.0 – 1.0 fraction of must-have requirements covered */
  mustCoverageRatio: number;
  /** true when every must-have requirement is covered */
  mustsCovered: boolean;
  /** Number of coverage passes that have run so far */
  passes: number;
}

/**
 * Compute a full coverage report.
 *
 * @param requirements  All requirements from the extraction phase
 * @param questions     All questions accumulated so far (across all passes)
 * @param passes        Number of pass iterations completed
 */
export function computeCoverage(
  requirements: Requirement[],
  questions: Question[],
  passes: number
): CoverageReport {
  if (requirements.length === 0) {
    return {
      uncoveredRequirementIds: [],
      uncoveredMustIds: [],
      coveredRequirementIds: [],
      coverageRatio: 1,
      mustCoverageRatio: 1,
      mustsCovered: true,
      passes,
    };
  }

  // Build the set of requirement IDs referenced by at least one question
  const referencedIds = new Set<string>();
  for (const q of questions) {
    for (const rid of q.requirement_ids) {
      referencedIds.add(rid);
    }
  }

  const validReqIds = new Set(requirements.map((r) => r.id));
  const mustReqs = requirements.filter((r) => r.priority === 'must');

  const coveredRequirementIds = requirements
    .filter((r) => referencedIds.has(r.id))
    .map((r) => r.id);

  const uncoveredRequirementIds = requirements
    .filter((r) => !referencedIds.has(r.id))
    .map((r) => r.id);

  const uncoveredMustIds = mustReqs
    .filter((r) => !referencedIds.has(r.id))
    .map((r) => r.id);

  const coverageRatio = coveredRequirementIds.length / requirements.length;
  const mustCoverageRatio =
    mustReqs.length === 0
      ? 1
      : (mustReqs.length - uncoveredMustIds.length) / mustReqs.length;

  return {
    uncoveredRequirementIds,
    uncoveredMustIds,
    coveredRequirementIds,
    coverageRatio,
    mustCoverageRatio,
    mustsCovered: uncoveredMustIds.length === 0,
    passes,
  };
}

/**
 * Convert a CoverageReport to the shared Coverage schema shape.
 */
export function toCoverageSchema(
  report: CoverageReport,
  gapAnalysis?: string
): Coverage {
  return {
    uncovered_requirement_ids: report.uncoveredRequirementIds,
    passes: report.passes,
    ...(gapAnalysis ? { gap_analysis: gapAnalysis } : {}),
  };
}

/**
 * Returns requirements not yet covered by any existing question.
 * Used to drive the gap-filling pass.
 */
export function findUncoveredRequirements(
  requirements: Requirement[],
  questions: Question[]
): Requirement[] {
  const referencedIds = new Set<string>(
    questions.flatMap((q) => q.requirement_ids)
  );
  return requirements.filter((r) => !referencedIds.has(r.id));
}

/**
 * Validate that every question references at least one real requirement ID.
 * Returns questions whose references are all invalid, for logging.
 */
export function findOrphanedQuestions(
  questions: Question[],
  requirements: Requirement[]
): Question[] {
  const validIds = new Set(requirements.map((r) => r.id));
  return questions.filter((q) =>
    q.requirement_ids.every((rid) => !validIds.has(rid))
  );
}

/**
 * Deduplicate questions: keep the first occurrence of a question with the same
 * prompt text (case-insensitive).  Does NOT remove questions that differ only
 * in category — a behavioural and a technical question on the same topic are
 * meaningfully different.
 */
export function deduplicateQuestions(questions: Question[]): Question[] {
  const seen = new Map<string, string>(); // normalizedKey → category
  const result: Question[] = [];

  for (const q of questions) {
    const normalizedPrompt = q.prompt.trim().toLowerCase();
    // Key = prompt + category — preserving category differences
    const key = `${normalizedPrompt}||${q.category}`;
    if (!seen.has(key)) {
      seen.set(key, q.category);
      result.push(q);
    }
  }

  return result;
}
