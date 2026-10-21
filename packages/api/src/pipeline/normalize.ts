/**
 * Input Normalization for Generation Pipeline
 *
 * Normalizes company URLs and pasted Job Descriptions before processing.
 * Does not retrieve the JD from the web.
 */

import { URL } from 'url';
import { z } from 'zod';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'ref',
  'ref_src',
  'source',
]);

/**
 * Normalizes a pasted job description:
 * - Trims leading/trailing whitespace
 * - Replaces CRLF and CR with LF
 * - Replaces non-breaking spaces with standard spaces
 * - Removes non-printable control characters (preserving tabs and newlines)
 * - Collapses runs of 3+ newlines down to 2
 */
export function normalizeJobDescription(raw: string): string {
  if (!raw) return '';

  return raw
    .replace(/\r\n|\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normalizes a company URL:
 * - Adds https:// protocol if missing
 * - Lowercases scheme and host
 * - Strips URL fragment
 * - Strips marketing tracking query parameters (utm_*, gclid, etc.)
 * - Strips trailing slash on root paths
 */
export function normalizeCompanyUrl(rawUrl: string): string {
  let trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Company URL cannot be empty');
  }

  // Prepend protocol if missing
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  const parsed = new URL(trimmed);
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = '';

  // Filter out tracking parameters
  const keysToDelete: string[] = [];
  parsed.searchParams.forEach((_, key) => {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
      keysToDelete.push(key);
    }
  });
  for (const k of keysToDelete) {
    parsed.searchParams.delete(k);
  }

  let result = parsed.toString();
  // Remove trailing slash on root path (e.g., https://example.com/ -> https://example.com)
  if (parsed.pathname === '/' && !parsed.search && result.endsWith('/')) {
    result = result.slice(0, -1);
  }

  return result;
}

export const PipelineInputSchema = z.object({
  jobDescription: z.string(),
  companyUrl: z.string(),
  daysAvailable: z.number().int().positive().max(90).optional(),
  prepDays: z.number().int().positive().max(90).optional(),
  userId: z.string().min(1).default('anonymous'),
}).refine(data => data.daysAvailable !== undefined || data.prepDays !== undefined, {
  message: 'Either daysAvailable or prepDays must be provided',
});

export interface NormalizedInput {
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
  userId: string;
}

/**
 * Validates and normalizes input case for the pipeline.
 * Throws an Error with descriptive message if validation fails.
 */
export function validateAndNormalizeInput(rawInput: unknown): NormalizedInput {
  const parsed = PipelineInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Input validation failed: ${issues}`);
  }

  const rawJd = parsed.data.jobDescription;
  const rawUrl = parsed.data.companyUrl;
  const days = parsed.data.daysAvailable ?? parsed.data.prepDays ?? 7;

  const normalizedJd = normalizeJobDescription(rawJd);
  if (normalizedJd.length < 10) {
    throw new Error(
      `Job description too short after normalization: ${normalizedJd.length} chars (minimum 10 required)`
    );
  }

  const normalizedUrl = normalizeCompanyUrl(rawUrl);

  return {
    jobDescription: normalizedJd,
    companyUrl: normalizedUrl,
    daysAvailable: days,
    userId: parsed.data.userId,
  };
}
