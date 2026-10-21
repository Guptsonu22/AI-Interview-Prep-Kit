import { Router, Response } from 'express';
import { z } from 'zod';
import { KitModel, IKit, PipelineJob, PracticeRecord } from '../../db/models';
import { Kit as SharedKit, validateKit, KitSchema, type Question, type Flashcard, type Day, sanitizeRequirementReferences } from '@interview-prep/shared';
import { allocateStudySchedule } from '@interview-prep/shared/scheduler';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { pipelineQueue } from '../../services/pipelineQueue';
import { requireKitOwnership, attachKitIfOwned } from '../../middleware/ownership';
import { generateQuestionsForRequirement, generateCompanyBrief, getDefaultLLMClient } from '../../llm';
import pino from 'pino';

const logger = pino({ name: 'kits-routes' });
const router = Router();

// ────────────────────────────────────────────────────────────────────────────
// Validation Schemas
// ────────────────────────────────────────────────────────────────────────────

const createKitSchema = z.object({
  jobDescription: z.string().min(100),
  companyUrl: z.string().url(),
  daysAvailable: z.number().int().positive().max(90).default(7),
  generateNow: z.boolean().optional(),
});

const patchKitSchema = z.object({
  status: z.enum(['draft', 'generating', 'ready', 'archived']).optional(),
  daysAvailable: z.number().int().positive().max(90).optional(),
  jobDescription: z.string().min(100).optional(),
  companyUrl: z.string().url().optional(),
  version: z.number().int().optional(),
  kitData: z.record(z.unknown()).optional(),
  generationError: z.string().nullable().optional(),
});

const updateSectionSchema = z.object({
  section: z.enum(['requirements', 'questions', 'flashcards', 'schedule', 'coverage', 'company_brief', 'role']),
  items: z.unknown(),
  edited: z.boolean().optional(),
  pinned: z.boolean().optional(),
  version: z.number().int().optional(),
  order: z.array(z.string()).optional(),
});

const patchCompanyBriefSchema = z.object({
  summary: z.string().optional(),
  what_they_do: z.string().optional(),
  sources: z.array(z.string()).optional(),
  version: z.number().int().optional(),
});

const patchScheduleDaySchema = z.object({
  focus: z.string().optional(),
  minutes: z.number().int().positive().optional(),
  question_ids: z.array(z.string()).optional(),
  version: z.number().int().optional(),
});

const createQuestionSchema = z.object({
  prompt: z.string().min(1),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']),
  requirement_ids: z.array(z.string()).default([]),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  answer_outline: z.string().default(''),
  version: z.number().int().optional(),
});

const patchQuestionSchema = z.object({
  prompt: z.string().min(1).optional(),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']).optional(),
  requirement_ids: z.array(z.string()).optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  answer_outline: z.string().optional(),
  version: z.number().int().optional(),
});

const reorderQuestionsSchema = z.object({
  order: z.array(z.string()),
  version: z.number().int().optional(),
});

const createFlashcardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string()).default([]),
  version: z.number().int().optional(),
});

const patchFlashcardSchema = z.object({
  front: z.string().min(1).optional(),
  back: z.string().min(1).optional(),
  requirement_ids: z.array(z.string()).optional(),
  version: z.number().int().optional(),
});

const practiceRecordSchema = z.object({
  flashcardId: z.string().min(1),
  confidence: z.number().int().min(0).max(5),
});

// Stage mapping for human-readable progress reporting
function mapStepToStage(step: string): { stage: string; progress: number } {
  switch (step) {
    case 'validate-input':
    case 'normalize-input':
      return { stage: 'validating input', progress: 5 };
    case 'extract-jd-metadata':
      return { stage: 'extracting requirements', progress: 15 };
    case 'crawl-company-site':
    case 'discover-hiring-pages':
    case 'search-interview-evidence':
    case 'generate-company-brief':
      return { stage: 'researching company', progress: 35 };
    case 'generate-technical-questions':
    case 'generate-behavioural-questions':
    case 'generate-system-design-questions':
    case 'generate-company-fit-questions':
      return { stage: 'generating questions', progress: 60 };
    case 'generate-flashcards':
      return { stage: 'generating flashcards', progress: 70 };
    case 'compute-coverage-pass-1':
    case 'identify-uncovered-musts':
      return { stage: 'checking coverage', progress: 80 };
    case 'generate-gap-questions':
      return { stage: 'filling gaps', progress: 85 };
    case 'generate-schedule':
      return { stage: 'scheduling', progress: 92 };
    case 'finalize-kit':
      return { stage: 'validating', progress: 98 };
    case 'completed':
      return { stage: 'completed', progress: 100 };
    default:
      return { stage: step || 'processing', progress: 50 };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Kit Creation & Listing Endpoints
// ────────────────────────────────────────────────────────────────────────────

router.post('/', asyncHandler(async (req: AuthRequest, res) => {
  const data = createKitSchema.parse(req.body);

  const kit = await KitModel.create({
    userId: req.user!.id,
    jobDescription: data.jobDescription,
    companyUrl: data.companyUrl,
    daysAvailable: data.daysAvailable,
    kitData: {} as SharedKit,
    sections: {
      requirements: { items: [], edited: false, pinned: false, version: 0 },
      questions: { items: [], edited: false, pinned: false, version: 0, order: [] },
      flashcards: { items: [], edited: false, pinned: false, version: 0 },
      schedule: { items: [], edited: false, pinned: false, version: 0 },
      coverage: { items: {}, version: 0 },
    },
    status: 'draft',
  });

  let jobId: string | undefined;
  if (data.generateNow) {
    kit.status = 'generating';
    await kit.save();
    const job = await pipelineQueue.add({
      kitId: kit._id.toString(),
      userId: req.user!.id,
      jobDescription: kit.jobDescription,
      companyUrl: kit.companyUrl,
      daysAvailable: kit.daysAvailable,
    });
    jobId = job.id;
  }

  res.status(201).json({ kit: serializeKit(kit), jobId });
}));

router.get('/', asyncHandler(async (req: AuthRequest, res) => {
  const { status, limit = '50', offset = '0' } = req.query;
  const query: Record<string, unknown> = { userId: req.user!.id };
  if (status && typeof status === 'string') {
    query['status'] = status;
  }

  const kits = await KitModel.find(query)
    .sort({ createdAt: -1 })
    .skip(parseInt(offset as string, 10))
    .limit(Math.min(parseInt(limit as string, 10), 100))
    .lean();

  const total = await KitModel.countDocuments(query);
  res.json({ kits: kits.map(serializeKit), total });
}));

router.get('/:id', attachKitIfOwned(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit;
  if (!kit) {
    throw new AppError(404, 'Kit not found');
  }
  res.json({ kit: serializeKit(kit) });
}));

router.patch('/:id', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const updates = patchKitSchema.parse(req.body);

  // Optimistic Concurrency Check: prevent accidental overwrites
  if (updates.version !== undefined && updates.version !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${updates.version}, current is ${kit.version}`);
  }

  if (updates.status) kit.status = updates.status;
  if (updates.daysAvailable) kit.daysAvailable = updates.daysAvailable;
  if (updates.jobDescription) kit.jobDescription = updates.jobDescription;
  if (updates.companyUrl) kit.companyUrl = updates.companyUrl;

  if (updates.kitData) {
    const currentKitData = (kit.kitData || {}) as SharedKit;
    const merged = { ...currentKitData, ...updates.kitData };
    if (merged.requirements) {
      sanitizeRequirementReferences(merged, merged.requirements);
    }
    const validation = validateKit(merged);
    if (!validation.success) {
      throw new AppError(400, 'Invalid kit data structure', validation.errors.errors);
    }
    kit.kitData = merged;
  }

  if (updates.generationError !== undefined) {
    kit.generationError = updates.generationError;
  }

  await kit.save();
  res.json({ kit: serializeKit(kit) });
}));

router.delete('/:id', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  await Promise.all([
    KitModel.findByIdAndDelete(kit._id),
    PracticeRecord.deleteMany({ kitId: kit._id }),
    PipelineJob.deleteMany({ kitId: kit._id }),
  ]);
  res.status(204).send();
}));

// ────────────────────────────────────────────────────────────────────────────
// Generation & Progress Endpoints
// ────────────────────────────────────────────────────────────────────────────

router.post('/:id/generate', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;

  // Duplicate / Idempotency protection: Prevent concurrent runs for the same kit
  if (kit.status === 'generating') {
    throw new AppError(409, 'Generation is already in progress for this kit');
  }

  kit.status = 'generating';
  kit.generationError = null;
  await kit.save();

  const job = await pipelineQueue.add({
    kitId: kit._id.toString(),
    userId: req.user!.id,
    jobDescription: kit.jobDescription,
    companyUrl: kit.companyUrl,
    daysAvailable: kit.daysAvailable,
  });

  res.status(202).json({ jobId: job.id, status: 'started' });
}));

router.get('/:id/progress', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res: Response) => {
  const kitId = req.params['id'];

  // Server-Sent Events (SSE) mode if requested by client
  if (req.headers.accept === 'text/event-stream') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const intervalId = setInterval(async () => {
      try {
        const job = await PipelineJob.findOne({ kitId }).sort({ createdAt: -1 }).lean();
        if (!job) {
          res.write(`data: ${JSON.stringify({ status: 'pending', stage: 'queued', progress: 0 })}\n\n`);
          return;
        }

        const { stage, progress } = mapStepToStage(job.currentStep);
        const payload = {
          jobId: job._id.toString(),
          status: job.status,
          currentStep: job.currentStep,
          stage,
          progress,
          error: job.error,
          logs: (job.logs || []).slice(-5),
        };

        res.write(`data: ${JSON.stringify(payload)}\n\n`);

        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(intervalId);
          res.end();
        }
      } catch (err) {
        clearInterval(intervalId);
        res.end();
      }
    }, 1000);

    req.on('close', () => clearInterval(intervalId));
    return;
  }

  // Standard JSON polling response
  const job = await PipelineJob.findOne({ kitId }).sort({ createdAt: -1 }).lean();
  if (!job) {
    return res.json({
      status: 'pending',
      currentStep: 'queued',
      stage: 'queued',
      progress: 0,
      logs: [],
    });
  }

  const { stage, progress } = mapStepToStage(job.currentStep);

  res.json({
    jobId: job._id.toString(),
    status: job.status,
    currentStep: job.currentStep,
    stage,
    progress,
    error: job.error,
    resultKitId: job.resultKitId?.toString() ?? null,
    logs: job.logs || [],
  });
}));

// Backward-compatible status alias
router.get('/:id/status', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const jobId = req.params['id'] as string;
  const job = await pipelineQueue.getJob(jobId);
  if (!job) {
    // Also check by kitId
    const dbJob = await PipelineJob.findOne({ kitId: jobId }).sort({ createdAt: -1 }).lean();
    if (dbJob) {
      return res.json({ job: serializeJob({ ...dbJob, id: dbJob._id.toString() } as any) });
    }
    throw new AppError(404, 'Job not found');
  }
  res.json({ job: serializeJob(job) });
}));

// ────────────────────────────────────────────────────────────────────────────
// Targeted Partial Regeneration Endpoints
// ────────────────────────────────────────────────────────────────────────────

router.post('/:id/regenerate/company-brief', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;

  if (kit.sections?.company_brief?.pinned) {
    throw new AppError(409, 'Company brief section is pinned and cannot be regenerated');
  }

  // Optimistic concurrency check
  if (req.body?.version !== undefined && req.body.version !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${req.body.version}, current is ${kit.version}`);
  }

  const client = getDefaultLLMClient();
  const brief = await generateCompanyBrief(
    [{ text: kit.jobDescription, url: kit.companyUrl }],
    client
  );

  kit.kitData.company_brief = {
    summary: brief.summary,
    what_they_do: brief.what_they_do,
    sources: brief.sources.length > 0 ? brief.sources : [kit.companyUrl],
  };

  kit.sections.company_brief = {
    items: [kit.kitData.company_brief],
    edited: false,
    pinned: false,
    version: ((kit.sections as any).company_brief?.version || 0) + 1,
  } as any;

  kit.lastRegeneratedAt = new Date();
  await kit.save();

  res.json({ company_brief: kit.kitData.company_brief, kit: serializeKit(kit) });
}));

router.post('/:id/regenerate/questions/:category', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const categoryParam = req.params['category'];

  const validCategories = ['technical', 'behavioural', 'system-design', 'company-fit'];
  if (!validCategories.includes(categoryParam)) {
    throw new AppError(400, `Invalid category: ${categoryParam}. Must be one of ${validCategories.join(', ')}`);
  }
  const category = categoryParam as 'technical' | 'behavioural' | 'system-design' | 'company-fit';

  // Rule 4: Pinned questions section cannot be regenerated
  if (kit.sections?.questions?.pinned) {
    throw new AppError(409, 'Questions section is pinned and cannot be regenerated');
  }

  // Rule 10: Optimistic concurrency check
  if (req.body?.version !== undefined && req.body.version !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${req.body.version}, current is ${kit.version}`);
  }

  const client = getDefaultLLMClient();
  const requirements = kit.kitData?.requirements || [];
  const targetReq = requirements.find((r) => r.priority === 'must') || requirements[0] || {
    id: 'req_core',
    text: 'Core job responsibilities',
    kind: 'technical',
    priority: 'must',
  };

  const newQuestions = await generateQuestionsForRequirement(
    targetReq,
    category,
    {
      seniority: kit.kitData?.role?.seniority || 'Mid',
      roleTitle: kit.kitData?.role?.title || 'Software Engineer',
      companyBrief: kit.kitData?.company_brief?.summary,
    },
    client
  );

  const existingQuestions: Question[] = kit.kitData?.questions || [];

  // Rule 5: Regeneration must not discard edits in unrelated categories
  const otherCategoryQuestions = existingQuestions.filter((q) => q.category !== category);

  // Rule 6: Regenerating one category must preserve user-created, user-edited, and pinned questions
  const thisCategoryQuestions = existingQuestions.filter((q) => q.category === category);
  const protectedQuestions = thisCategoryQuestions.filter((q) =>
    q.provenance === 'user_created' ||
    q.id.startsWith('q_user_') ||
    q.edited === true ||
    q.pinned === true
  );

  // Rule: Avoid duplicate questions (prompt text deduplication)
  const existingPromptKeys = new Set(
    protectedQuestions.map((q) => q.prompt.trim().toLowerCase())
  );

  const uniqueDraftQuestions: Question[] = [];
  for (const nq of newQuestions) {
    const key = nq.prompt.trim().toLowerCase();
    if (!existingPromptKeys.has(key)) {
      uniqueDraftQuestions.push({
        id: nq.id || `q_${category}_${Math.random().toString(36).slice(2, 7)}`,
        requirement_ids: nq.requirement_ids?.length ? nq.requirement_ids : [targetReq.id],
        category,
        prompt: nq.prompt,
        answer_outline: nq.answer_outline || '',
        difficulty: (nq.difficulty as 1 | 2 | 3) || 2,
        provenance: 'generated',
        edited: false,
        pinned: false,
      });
      existingPromptKeys.add(key);
    }
  }

  // Merge preserved content with new draft content
  const mergedQuestions = [...otherCategoryQuestions, ...protectedQuestions, ...uniqueDraftQuestions];
  kit.kitData.questions = mergedQuestions;

  // Re-synchronize schedule and validate consistency
  if (kit.sections?.schedule?.pinned) {
    // If schedule is pinned, prune any removed question IDs to prevent dead references
    const validIds = new Set(mergedQuestions.map((q) => q.id));
    if (kit.kitData?.schedule?.days) {
      for (const day of kit.kitData.schedule.days) {
        day.question_ids = day.question_ids.filter((qid) => validIds.has(qid));
      }
    }
  } else {
    const { schedule } = allocateStudySchedule(
      { requirements, questions: mergedQuestions },
      kit.daysAvailable
    );
    kit.kitData.schedule = schedule;
    kit.sections.schedule = {
      items: schedule.days,
      edited: kit.sections?.schedule?.edited || false,
      pinned: false,
      version: (kit.sections?.schedule?.version || 0) + 1,
    };
  }

  // Preserve ordering state: keep relative order of existing questions, append new draft questions
  const existingOrder = kit.sections?.questions?.order || [];
  const mergedIds = new Set(mergedQuestions.map((q) => q.id));
  const preservedOrder = existingOrder.filter((id) => mergedIds.has(id));
  for (const q of mergedQuestions) {
    if (!preservedOrder.includes(q.id)) {
      preservedOrder.push(q.id);
    }
  }

  kit.sections.questions = {
    items: mergedQuestions,
    edited: kit.sections?.questions?.edited || false,
    pinned: false,
    version: (kit.sections?.questions?.version || 0) + 1,
    order: preservedOrder,
  };

  kit.lastRegeneratedAt = new Date();
  await kit.save();

  res.json({ questions: mergedQuestions, kit: serializeKit(kit) });
}));

router.post('/:id/regenerate/schedule', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;

  if (kit.sections?.schedule?.pinned) {
    throw new AppError(409, 'Schedule section is pinned and cannot be regenerated');
  }

  // Optimistic concurrency check
  if (req.body?.version !== undefined && req.body.version !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${req.body.version}, current is ${kit.version}`);
  }

  const days = req.body.daysAvailable ? Number(req.body.daysAvailable) : kit.daysAvailable;
  const { schedule } = allocateStudySchedule(
    {
      requirements: kit.kitData?.requirements || [],
      questions: kit.kitData?.questions || [],
    },
    days
  );

  kit.daysAvailable = days;
  kit.kitData.schedule = schedule;
  kit.sections.schedule = {
    items: schedule.days,
    edited: false,
    pinned: false,
    version: (kit.sections?.schedule?.version || 0) + 1,
  };

  kit.lastRegeneratedAt = new Date();
  await kit.save();

  res.json({ schedule, kit: serializeKit(kit) });
}));

// ────────────────────────────────────────────────────────────────────────────
// Section-Level State Machine & Pinned Updates
// ────────────────────────────────────────────────────────────────────────────

router.patch('/:id/sections/:section', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const sectionParam = req.params['section'];

  const validSections = ['requirements', 'questions', 'flashcards', 'schedule', 'coverage', 'company_brief', 'role'];
  if (!validSections.includes(sectionParam)) {
    throw new AppError(400, `Invalid section: ${sectionParam}`);
  }

  const sectionData = (kit.sections as any)[sectionParam] || { items: [], edited: false, pinned: false, version: 0 };

  // Rule: Pinned sections cannot be modified
  if (sectionData.pinned && req.body.pinned !== false) {
    throw new AppError(409, `Section "${sectionParam}" is pinned and cannot be modified`);
  }

  // Optimistic concurrency check per section
  if (req.body.version !== undefined && req.body.version !== sectionData.version) {
    throw new AppError(409, `Version mismatch for section "${sectionParam}": provided ${req.body.version}, current is ${sectionData.version}`);
  }

  if (req.body.items !== undefined) {
    sectionData.items = req.body.items;
    sectionData.edited = req.body.edited ?? true;
    if (sectionParam === 'company_brief') {
      kit.kitData.company_brief = Array.isArray(req.body.items) ? req.body.items[0] : req.body.items;
    } else if (sectionParam === 'role') {
      kit.kitData.role = Array.isArray(req.body.items) ? req.body.items[0] : req.body.items;
    } else if (sectionParam === 'schedule') {
      if (Array.isArray(req.body.items)) {
        kit.kitData.schedule = {
          days_available: kit.daysAvailable,
          days: req.body.items,
        };
      } else {
        kit.kitData.schedule = req.body.items;
      }
    } else {
      (kit.kitData as any)[sectionParam] = req.body.items;
    }

    // Rule 8: Remove stale requirement references safely if requirements are explicitly changed
    if (sectionParam === 'requirements' && Array.isArray(req.body.items)) {
      sanitizeRequirementReferences(kit.kitData, req.body.items);
      if (kit.sections?.questions) {
        kit.sections.questions.items = kit.kitData.questions;
      }
      if (kit.sections?.flashcards) {
        kit.sections.flashcards.items = kit.kitData.flashcards;
      }
    }
  }

  if (req.body.pinned !== undefined) {
    sectionData.pinned = req.body.pinned;
  }

  sectionData.version += 1;
  (kit.sections as any)[sectionParam] = sectionData;

  await kit.save();
  res.json({ section: sectionData, kit: serializeKit(kit) });
}));

router.post('/:id/sections/:section/pin', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const { section } = req.params;
  const { pinned } = z.object({ pinned: z.boolean() }).parse(req.body);

  const sectionData = (kit.sections as any)[section];
  if (!sectionData) {
    throw new AppError(400, 'Invalid section');
  }

  sectionData.pinned = pinned;
  await kit.save();
  res.json({ kit: serializeKit(kit) });
}));

// ────────────────────────────────────────────────────────────────────────────
// Granular Question Management Endpoints
// ────────────────────────────────────────────────────────────────────────────

router.post('/:id/questions', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  if (kit.sections?.questions?.pinned) {
    throw new AppError(409, 'Questions section is pinned');
  }

  if (req.body?.version !== undefined && req.body.version !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${req.body.version}, current is ${kit.version}`);
  }

  const data = createQuestionSchema.parse(req.body);
  const newQuestion: Question = {
    id: `q_user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    prompt: data.prompt,
    category: data.category,
    requirement_ids: data.requirement_ids,
    difficulty: data.difficulty,
    answer_outline: data.answer_outline,
    provenance: 'user_created',
    edited: false,
    pinned: false,
  };

  const questions: Question[] = kit.kitData?.questions || [];
  questions.push(newQuestion);
  kit.kitData.questions = questions;

  kit.sections.questions = {
    items: questions,
    edited: true,
    pinned: false,
    version: (kit.sections?.questions?.version || 0) + 1,
    order: questions.map((q) => q.id),
  };

  // Re-synchronize schedule to ensure every question is scheduled
  const { schedule } = allocateStudySchedule(
    { requirements: kit.kitData?.requirements || [], questions },
    kit.daysAvailable
  );
  kit.kitData.schedule = schedule;
  kit.sections.schedule.items = schedule.days;

  await kit.save();
  res.status(201).json({ question: newQuestion, kit: serializeKit(kit) });
}));

router.patch('/:id/questions/:questionId/pin', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const { questionId } = req.params;
  const { pinned } = z.object({ pinned: z.boolean() }).parse(req.body);

  if (req.body?.version !== undefined && req.body.version !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${req.body.version}, current is ${kit.version}`);
  }

  const questions: Question[] = kit.kitData?.questions || [];
  const target = questions.find((q) => q.id === questionId);
  if (!target) {
    throw new AppError(404, `Question "${questionId}" not found in kit`);
  }

  target.pinned = pinned;
  kit.sections.questions.items = questions;
  kit.sections.questions.version += 1;

  await kit.save();
  res.json({ question: target, kit: serializeKit(kit) });
}));

router.patch('/:id/questions/:questionId', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const { questionId } = req.params;

  if (kit.sections?.questions?.pinned) {
    throw new AppError(409, 'Questions section is pinned');
  }

  if (req.body?.version !== undefined && req.body.version !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${req.body.version}, current is ${kit.version}`);
  }

  const updates = patchQuestionSchema.parse(req.body);
  const questions: Question[] = kit.kitData?.questions || [];
  const qIdx = questions.findIndex((q) => q.id === questionId);

  if (qIdx === -1) {
    throw new AppError(404, `Question "${questionId}" not found in kit`);
  }

  const existing = questions[qIdx]!;
  const updatedQuestion: Question = {
    id: existing.id,
    prompt: updates.prompt ?? existing.prompt,
    category: updates.category ?? existing.category,
    requirement_ids: updates.requirement_ids ?? existing.requirement_ids,
    difficulty: updates.difficulty ?? existing.difficulty,
    answer_outline: updates.answer_outline ?? existing.answer_outline,
    provenance: existing.provenance,
    edited: true, // Marked as edited by user
    pinned: existing.pinned,
  };

  questions[qIdx] = updatedQuestion;
  kit.kitData.questions = questions;
  kit.sections.questions.items = questions;
  kit.sections.questions.edited = true;
  kit.sections.questions.version += 1;

  await kit.save();
  res.json({ question: updatedQuestion, kit: serializeKit(kit) });
}));

router.patch('/:id/questions/:questionId/category', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const { questionId } = req.params;
  const { category } = z.object({
    category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']),
    version: z.number().int().optional(),
  }).parse(req.body);

  if (kit.sections?.questions?.pinned) {
    throw new AppError(409, 'Questions section is pinned');
  }

  if (req.body?.version !== undefined && req.body.version !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${req.body.version}, current is ${kit.version}`);
  }

  const questions: Question[] = kit.kitData?.questions || [];
  const target = questions.find((q) => q.id === questionId);
  if (!target) {
    throw new AppError(404, `Question "${questionId}" not found`);
  }

  target.category = category;
  kit.sections.questions.items = questions;
  kit.sections.questions.edited = true;
  kit.sections.questions.version += 1;

  await kit.save();
  res.json({ question: target, kit: serializeKit(kit) });
}));

router.delete('/:id/questions/:questionId', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const { questionId } = req.params;

  if (kit.sections?.questions?.pinned) {
    throw new AppError(409, 'Questions section is pinned');
  }

  const clientVersion = req.query['version'] ? parseInt(req.query['version'] as string, 10) : req.body?.version;
  if (clientVersion !== undefined && clientVersion !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${clientVersion}, current is ${kit.version}`);
  }

  const questions: Question[] = kit.kitData?.questions || [];
  kit.kitData.questions = questions.filter((q) => q.id !== questionId);
  kit.sections.questions.items = kit.kitData.questions;
  kit.sections.questions.edited = true;
  kit.sections.questions.version += 1;

  // Remove from schedule days
  if (kit.kitData?.schedule?.days) {
    for (const day of kit.kitData.schedule.days) {
      day.question_ids = day.question_ids.filter((id) => id !== questionId);
    }
    kit.sections.schedule.items = kit.kitData.schedule.days;
  }

  await kit.save();
  res.json({ success: true, kit: serializeKit(kit) });
}));

router.post('/:id/questions/reorder', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const { order, version } = reorderQuestionsSchema.parse(req.body);

  if (kit.sections?.questions?.pinned) {
    throw new AppError(409, 'Questions section is pinned');
  }

  if (version !== undefined && version !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${version}, current is ${kit.version}`);
  }

  kit.sections.questions.order = order;
  kit.sections.questions.edited = true;
  kit.sections.questions.version += 1;

  await kit.save();
  res.json({ order, kit: serializeKit(kit) });
}));

// ────────────────────────────────────────────────────────────────────────────
// Granular Flashcard Management Endpoints
// ────────────────────────────────────────────────────────────────────────────

router.post('/:id/flashcards', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  if (kit.sections?.flashcards?.pinned) {
    throw new AppError(409, 'Flashcards section is pinned');
  }

  if (req.body?.version !== undefined && req.body.version !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${req.body.version}, current is ${kit.version}`);
  }

  const data = createFlashcardSchema.parse(req.body);
  const newCard: Flashcard = {
    id: `fc_user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    front: data.front,
    back: data.back,
    requirement_ids: data.requirement_ids,
    provenance: 'user_created',
    edited: false,
    pinned: false,
  };

  const flashcards: Flashcard[] = kit.kitData?.flashcards || [];
  flashcards.push(newCard);
  kit.kitData.flashcards = flashcards;

  kit.sections.flashcards = {
    items: flashcards,
    edited: true,
    pinned: false,
    version: (kit.sections?.flashcards?.version || 0) + 1,
  };

  await kit.save();
  res.status(201).json({ flashcard: newCard, kit: serializeKit(kit) });
}));

router.patch('/:id/flashcards/:flashcardId/pin', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const { flashcardId } = req.params;
  const { pinned, version } = z.object({ pinned: z.boolean(), version: z.number().int().optional() }).parse(req.body);

  if (version !== undefined && version !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${version}, current is ${kit.version}`);
  }

  const flashcards: Flashcard[] = kit.kitData?.flashcards || [];
  const target = flashcards.find((f) => f.id === flashcardId);
  if (!target) {
    throw new AppError(404, `Flashcard "${flashcardId}" not found in kit`);
  }

  target.pinned = pinned;
  kit.sections.flashcards.items = flashcards;
  kit.sections.flashcards.version += 1;

  await kit.save();
  res.json({ flashcard: target, kit: serializeKit(kit) });
}));

router.patch('/:id/flashcards/:flashcardId', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const { flashcardId } = req.params;

  if (kit.sections?.flashcards?.pinned) {
    throw new AppError(409, 'Flashcards section is pinned');
  }

  if (req.body?.version !== undefined && req.body.version !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${req.body.version}, current is ${kit.version}`);
  }

  const updates = patchFlashcardSchema.parse(req.body);
  const flashcards: Flashcard[] = kit.kitData?.flashcards || [];
  const cardIdx = flashcards.findIndex((f) => f.id === flashcardId);

  if (cardIdx === -1) {
    throw new AppError(404, `Flashcard "${flashcardId}" not found in kit`);
  }

  const existing = flashcards[cardIdx]!;
  const updatedCard: Flashcard = {
    id: existing.id,
    front: updates.front ?? existing.front,
    back: updates.back ?? existing.back,
    requirement_ids: updates.requirement_ids ?? existing.requirement_ids,
    provenance: existing.provenance || 'generated',
    edited: true,
    pinned: existing.pinned || false,
  };

  flashcards[cardIdx] = updatedCard;
  kit.kitData.flashcards = flashcards;
  kit.sections.flashcards.items = flashcards;
  kit.sections.flashcards.edited = true;
  kit.sections.flashcards.version += 1;

  await kit.save();
  res.json({ flashcard: updatedCard, kit: serializeKit(kit) });
}));

router.delete('/:id/flashcards/:flashcardId', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const { flashcardId } = req.params;

  if (kit.sections?.flashcards?.pinned) {
    throw new AppError(409, 'Flashcards section is pinned');
  }

  const clientVersion = req.query['version'] ? parseInt(req.query['version'] as string, 10) : req.body?.version;
  if (clientVersion !== undefined && clientVersion !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${clientVersion}, current is ${kit.version}`);
  }

  const flashcards: Flashcard[] = kit.kitData?.flashcards || [];
  kit.kitData.flashcards = flashcards.filter((f) => f.id !== flashcardId);
  kit.sections.flashcards.items = kit.kitData.flashcards;
  kit.sections.flashcards.edited = true;
  kit.sections.flashcards.version += 1;

  // Cleanup corresponding practice records
  await PracticeRecord.deleteMany({ kitId: kit._id, flashcardId });

  await kit.save();
  res.json({ success: true, kit: serializeKit(kit) });
}));

// ────────────────────────────────────────────────────────────────────────────
// Direct Company Brief & Schedule Day Editing Endpoints
// ────────────────────────────────────────────────────────────────────────────

router.patch('/:id/company-brief', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;

  if (kit.sections?.company_brief?.pinned) {
    throw new AppError(409, 'Company brief section is pinned and cannot be modified');
  }

  const updates = patchCompanyBriefSchema.parse(req.body);
  if (updates.version !== undefined && updates.version !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${updates.version}, current is ${kit.version}`);
  }

  const currentBrief = kit.kitData?.company_brief || { summary: '', what_they_do: '', sources: [] };
  const updatedBrief = {
    summary: updates.summary ?? currentBrief.summary,
    what_they_do: updates.what_they_do ?? currentBrief.what_they_do,
    sources: updates.sources ?? currentBrief.sources,
  };

  kit.kitData.company_brief = updatedBrief;
  kit.sections.company_brief = {
    items: [updatedBrief],
    edited: true,
    pinned: kit.sections?.company_brief?.pinned || false,
    version: ((kit.sections as any).company_brief?.version || 0) + 1,
  } as any;

  await kit.save();
  res.json({ company_brief: updatedBrief, kit: serializeKit(kit) });
}));

router.patch('/:id/schedule/days/:day', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const dayNum = parseInt(req.params['day'], 10);
  if (isNaN(dayNum) || dayNum < 1) {
    throw new AppError(400, 'Invalid day number');
  }

  if (kit.sections?.schedule?.pinned) {
    throw new AppError(409, 'Schedule section is pinned and cannot be modified');
  }

  const updates = patchScheduleDaySchema.parse(req.body);
  if (updates.version !== undefined && updates.version !== kit.version) {
    throw new AppError(409, `Conflict: Stale kit version. Provided ${updates.version}, current is ${kit.version}`);
  }

  const days: Day[] = kit.kitData?.schedule?.days || [];
  const targetDay = days.find((d) => d.day === dayNum);
  if (!targetDay) {
    throw new AppError(404, `Day ${dayNum} not found in schedule`);
  }

  if (updates.focus !== undefined) targetDay.focus = updates.focus;
  if (updates.minutes !== undefined) targetDay.minutes = updates.minutes;
  if (updates.question_ids !== undefined) targetDay.question_ids = updates.question_ids;

  kit.sections.schedule.items = days;
  kit.sections.schedule.edited = true;
  kit.sections.schedule.version = (kit.sections.schedule.version || 0) + 1;

  await kit.save();
  res.json({ day: targetDay, schedule: kit.kitData.schedule, kit: serializeKit(kit) });
}));

// ────────────────────────────────────────────────────────────────────────────
// Practice & Flashcard SRS Endpoints
// ────────────────────────────────────────────────────────────────────────────

router.get('/:id/practice', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const now = new Date();

  const flashcards: Flashcard[] = kit.kitData?.flashcards || [];
  const records = await PracticeRecord.find({ kitId: kit._id, userId: req.user!.id }).lean();
  const recordMap = new Map(records.map((r) => [r.flashcardId, r]));

  // Calculate cards due for review
  const dueCards: Flashcard[] = [];
  let completedCount = 0;

  for (const card of flashcards) {
    const record = recordMap.get(card.id);
    if (!record || record.nextReviewAt <= now) {
      dueCards.push(card);
    }
    if (record && record.confidence >= 3) {
      completedCount++;
    }
  }

  res.json({
    flashcards: dueCards,
    totalCards: flashcards.length,
    dueCount: dueCards.length,
    completedCount,
    masteryRate: flashcards.length > 0 ? completedCount / flashcards.length : 0,
    records: records.map(serializePracticeRecord),
  });
}));

router.post('/:id/practice/records', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const { flashcardId, confidence } = practiceRecordSchema.parse(req.body);
  const now = new Date();

  let record = await PracticeRecord.findOne({ kitId: kit._id, userId: req.user!.id, flashcardId });
  if (!record) {
    record = new PracticeRecord({
      userId: req.user!.id,
      kitId: kit._id,
      flashcardId,
      confidence,
      reviewedAt: now,
      nextReviewAt: now,
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
    });
  }

  // SM-2 Spaced Repetition Logic
  const { interval, easeFactor, repetitions } = record;
  if (confidence >= 3) {
    let newInterval: number;
    if (repetitions === 0) newInterval = 1; // 1 hour
    else if (repetitions === 1) newInterval = 6; // 6 hours
    else newInterval = Math.round(interval * easeFactor);

    const newEaseFactor = Math.max(1.3, easeFactor + 0.1 - (5 - confidence) * (0.08 + (5 - confidence) * 0.02));
    record.interval = newInterval;
    record.easeFactor = newEaseFactor;
    record.repetitions = repetitions + 1;
  } else {
    record.interval = 1;
    record.easeFactor = Math.max(1.3, easeFactor - 0.2);
    record.repetitions = 0;
  }

  record.confidence = confidence as any;
  record.reviewedAt = now;
  record.nextReviewAt = new Date(now.getTime() + record.interval * 60 * 60 * 1000);
  await record.save();

  res.json({ record: serializePracticeRecord(record) });
}));

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function serializeKit(kit: any): Record<string, unknown> {
  return {
    id: kit._id.toString(),
    userId: kit.userId.toString(),
    jobDescription: kit.jobDescription,
    companyUrl: kit.companyUrl,
    daysAvailable: kit.daysAvailable,
    kitData: kit.kitData,
    sections: kit.sections,
    status: kit.status,
    generationError: kit.generationError,
    version: kit.version,
    lastRegeneratedAt: kit.lastRegeneratedAt?.toISOString() ?? null,
    createdAt: kit.createdAt.toISOString(),
    updatedAt: kit.updatedAt.toISOString(),
  };
}

function serializeJob(job: { id: string; status: string; currentStep: string; logs: unknown[]; resultKitId?: string | null; error?: string | null }): Record<string, unknown> {
  return {
    id: job.id,
    status: job.status,
    currentStep: job.currentStep,
    logs: job.logs,
    resultKitId: job.resultKitId ?? undefined,
    error: job.error ?? undefined,
  };
}

function serializePracticeRecord(record: any): Record<string, unknown> {
  return {
    id: record._id.toString(),
    flashcardId: record.flashcardId,
    confidence: record.confidence,
    interval: record.interval,
    easeFactor: record.easeFactor,
    repetitions: record.repetitions,
    reviewedAt: record.reviewedAt.toISOString(),
    nextReviewAt: record.nextReviewAt.toISOString(),
  };
}

export { router as kitsRouter };