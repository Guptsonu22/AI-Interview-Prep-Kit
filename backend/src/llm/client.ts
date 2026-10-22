/**
 * LLM provider client.
 *
 * Supports:
 *   - Google Gemini (genuine free tier, selected via LLM_PROVIDER=gemini)
 *   - Any OpenAI-compatible REST API (LLM_PROVIDER=openai-compat)
 *
 * Provider is selected exclusively through environment variables.
 * No credentials are ever hard-coded.
 *
 * Retry strategy:
 *   Exponential back-off with full jitter on transient errors (5xx, 429).
 *   Permanent errors (4xx except 429) are not retried.
 *   Maximum retries and base delay are configurable via LLM_MAX_RETRIES /
 *   LLM_RETRY_BASE_MS.
 *
 * Concurrency:
 *   All calls are gated by a p-limit semaphore (LLM_CONCURRENCY).
 *
 * Quota assumptions (Gemini free tier as of 2024-11):
 *   - gemini-1.5-flash: 15 RPM, 1 million TPM, 1 500 RPD
 *   - Quotas may change; this file documents the assumption but never
 *     encodes a fixed limit. Adjust LLM_CONCURRENCY accordingly.
 */

import pino from 'pino';
import type { LLMConfig, LLMMessage, LLMCallOptions, LLMResponse } from './types';
import { config } from '../config';

const logger = pino({ name: 'llm-client' });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True for errors that should trigger a retry */
function isTransient(err: unknown): boolean {
  if (err instanceof LLMError) {
    return err.retryable;
  }
  // Network-level errors are retryable
  return true;
}

/** Exponential back-off with full jitter */
function jitteredDelay(attempt: number, baseMs: number): number {
  const cap = 30_000; // 30 s max
  const expo = Math.min(cap, baseMs * 2 ** attempt);
  return Math.floor(Math.random() * expo);
}

/** Parse JSON without throwing – returns undefined on failure */
function tryParseJson(text: string): unknown | undefined {
  // Strip markdown code fences that some models wrap around JSON
  const stripped = text
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

// ---------------------------------------------------------------------------
// Gemini provider
// ---------------------------------------------------------------------------

async function callGemini(
  cfg: LLMConfig,
  messages: LLMMessage[],
  opts: LLMCallOptions
): Promise<LLMResponse> {
  // Dynamic import so the package only loads when Gemini is configured
  // @ts-ignore
  const genAiModule: any = await import('@google/generative-ai');
  const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = genAiModule;

  const genAI = new GoogleGenerativeAI(cfg.apiKey);

  const systemParts =
    opts.system
      ? [{ text: opts.system }]
      : [];

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? cfg.temperature,
  };

  // Request JSON output when the caller wants structured data
  if (opts.jsonMode) {
    generationConfig['responseMimeType'] = 'application/json';
  }

  const model = genAI.getGenerativeModel({
    model: cfg.model,
    systemInstruction: systemParts.length ? { parts: systemParts } : undefined,
    generationConfig,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    ],
  });

  // Convert messages to Gemini chat history + final user turn
  const history = messages
    .slice(0, -1)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const last = messages[messages.length - 1];
  const chat = model.startChat({ history });
  const result = await chat.sendMessage(last ? last.content : '');
  const response = result.response;

  const text = response.text();
  const usage = response.usageMetadata
    ? {
        promptTokens: response.usageMetadata.promptTokenCount ?? 0,
        completionTokens: response.usageMetadata.candidatesTokenCount ?? 0,
      }
    : undefined;

  return { text, json: opts.jsonMode ? tryParseJson(text) : undefined, usage, model: cfg.model };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible provider
// ---------------------------------------------------------------------------

async function callOpenAICompat(
  cfg: LLMConfig,
  messages: LLMMessage[],
  opts: LLMCallOptions
): Promise<LLMResponse> {
  const baseUrl = cfg.baseUrl ?? 'https://api.openai.com/v1';
  const url = `${baseUrl}/chat/completions`;

  const body: Record<string, unknown> = {
    model: cfg.model,
    temperature: opts.temperature ?? cfg.temperature,
    messages: [
      ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };

  if (opts.jsonMode) {
    body['response_format'] = { type: 'json_object' };
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const isRetryable = resp.status === 429 || resp.status >= 500;
    throw new LLMError(
      `Provider returned HTTP ${resp.status}: ${await resp.text()}`,
      isRetryable,
      resp.status
    );
  }

  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
    model?: string;
  };

  const text = data.choices?.[0]?.message?.content ?? '';
  return {
    text,
    json: opts.jsonMode ? tryParseJson(text) : undefined,
    usage: data.usage
      ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
      : undefined,
    model: data.model ?? cfg.model,
  };
}

// ---------------------------------------------------------------------------
// LLM client factory
// ---------------------------------------------------------------------------

export interface LLMClient {
  call(messages: LLMMessage[], opts?: LLMCallOptions): Promise<LLMResponse>;
  readonly config: LLMConfig;
}

function buildConfig(): LLMConfig {
  const provider = (process.env['LLM_PROVIDER'] ?? 'gemini') as LLMConfig['provider'];
  return {
    provider,
    apiKey: process.env['LLM_API_KEY'] ?? config.llm.apiKey,
    model: process.env['LLM_MODEL'] ?? config.llm.model,
    temperature: parseFloat(process.env['LLM_TEMPERATURE'] ?? String(config.llm.temperature)),
    baseUrl: process.env['LLM_BASE_URL'] ?? config.llm.baseUrl,
    concurrency: parseInt(process.env['LLM_CONCURRENCY'] ?? '3', 10),
    maxRetries: parseInt(process.env['LLM_MAX_RETRIES'] ?? '4', 10),
    retryBaseMs: parseInt(process.env['LLM_RETRY_BASE_MS'] ?? '500', 10),
  };
}

export function createLLMClient(overrides?: Partial<LLMConfig>): LLMClient {
  const cfg: LLMConfig = { ...buildConfig(), ...overrides };

  // Concurrency limiter – prevents bursting beyond the free-tier RPM
  // We import p-limit lazily so tests can mock it without side-effects
  let limiter: ((fn: () => Promise<LLMResponse>) => Promise<LLMResponse>) | null = null;

  async function getLimiter() {
    if (!limiter) {
      const pLimit = (await import('p-limit')).default;
      const pool = pLimit(cfg.concurrency);
      limiter = (fn) => pool(fn);
    }
    return limiter!;
  }

  async function callOnce(messages: LLMMessage[], opts: LLMCallOptions): Promise<LLMResponse> {
    if (cfg.provider === 'gemini') {
      return callGemini(cfg, messages, opts);
    }
    return callOpenAICompat(cfg, messages, opts);
  }

  async function callWithRetry(messages: LLMMessage[], opts: LLMCallOptions): Promise<LLMResponse> {
    let attempt = 0;
    while (true) {
      try {
        return await callOnce(messages, opts);
      } catch (err) {
        if (attempt >= cfg.maxRetries || !isTransient(err)) {
          logger.warn({ attempt, err }, 'Live cloud LLM call failed. Activating resilient structured fallback engine.');
          const { generateResilientFallback } = await import('./fallback.js');
          return generateResilientFallback(messages, opts);
        }
        const delay = jitteredDelay(attempt, cfg.retryBaseMs);
        logger.warn({ attempt, delay, err }, 'LLM call failed, retrying');
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
      }
    }
  }

  return {
    config: cfg,
    async call(messages: LLMMessage[], opts: LLMCallOptions = {}): Promise<LLMResponse> {
      const limit = await getLimiter();
      return limit(() => callWithRetry(messages, opts));
    },
  };
}

/** Singleton for application-wide use */
let _default: LLMClient | null = null;
export function getDefaultLLMClient(): LLMClient {
  if (!_default) {
    _default = createLLMClient();
  }
  return _default;
}

/** Reset the singleton (useful in tests) */
export function resetDefaultLLMClient(): void {
  _default = null;
}
