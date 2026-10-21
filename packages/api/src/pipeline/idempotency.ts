/**
 * Pipeline In-Flight Deduplication and Idempotency
 *
 * Ensures that identical pipeline inputs being processed concurrently
 * do not execute redundant LLM and crawling workloads. In-flight requests
 * for the same input fingerprint share the active execution promise.
 */

import { createHash } from 'crypto';
import type { Kit } from '@interview-prep/shared';

export interface PipelineResult {
  kit: Kit;
  passes: number;
  uncoveredMustCount: number;
  gapAnalysis?: string;
}

export class PipelineIdempotencyManager {
  private activeJobs = new Map<string, Promise<PipelineResult>>();

  /**
   * Generates a stable deterministic fingerprint for pipeline inputs.
   */
  public generateFingerprint(input: {
    jobDescription: string;
    companyUrl: string;
    daysAvailable: number;
  }): string {
    return createHash('sha256')
      .update(`${input.companyUrl.toLowerCase()}|${input.daysAvailable}|${input.jobDescription.trim()}`)
      .digest('hex');
  }

  /**
   * Executes a task with in-flight deduplication.
   * If a task with the given key is already running, returns the existing promise.
   */
  public async runDeduplicated(
    key: string,
    factory: () => Promise<PipelineResult>
  ): Promise<PipelineResult> {
    const existing = this.activeJobs.get(key);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      try {
        return await factory();
      } finally {
        this.activeJobs.delete(key);
      }
    })();

    this.activeJobs.set(key, promise);
    return promise;
  }

  public isInFlight(key: string): boolean {
    return this.activeJobs.has(key);
  }

  public getInFlightCount(): number {
    return this.activeJobs.size;
  }

  public clear(): void {
    this.activeJobs.clear();
  }
}

export const idempotencyManager = new PipelineIdempotencyManager();
