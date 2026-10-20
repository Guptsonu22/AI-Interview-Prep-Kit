import { Router } from 'express';
import { z } from 'zod';
import { KitModel, IKit } from '../../db/models';
import { Kit as SharedKit, validateKit, KitSchema } from '@interview-prep/shared';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { pipelineQueue } from '../../services/pipelineQueue';
import { requireKitOwnership, attachKitIfOwned } from '../../middleware/ownership';
import pino from 'pino';

const logger = pino({ name: 'kits-routes' });
const router = Router();

const createKitSchema = z.object({
  jobDescription: z.string().min(100),
  companyUrl: z.string().url(),
  daysAvailable: z.number().int().positive().max(90),
});

const updateSectionSchema = z.object({
  section: z.enum(['requirements', 'questions', 'flashcards', 'schedule', 'coverage']),
  items: z.array(z.unknown()),
  edited: z.boolean().optional(),
  pinned: z.boolean().optional(),
  order: z.array(z.string()).optional(),
});

const regenerateSectionSchema = z.object({
  section: z.enum(['requirements', 'questions', 'flashcards', 'schedule']),
  jobDescription: z.string().min(100).optional(),
  companyUrl: z.string().url().optional(),
  daysAvailable: z.number().int().positive().max(90).optional(),
});

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

  res.status(201).json({ kit: serializeKit(kit) });
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
  const updates = req.body;

  if (updates.status) {
    kit.status = updates.status;
  }

  if (updates.kitData) {
    const currentKitData = kit.kitData as SharedKit;
    let updatedKitData = { ...currentKitData, ...updates.kitData };

    const validation = validateKit(updatedKitData);
    if (!validation.success) {
      throw new AppError(400, 'Invalid kit data', validation.errors.errors);
    }
    kit.kitData = updatedKitData;
  }

  if (updates.generationError !== undefined) {
    kit.generationError = updates.generationError;
  }

  await kit.save();
  res.json({ kit: serializeKit(kit) });
}));

router.post('/:id/sections', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const data = updateSectionSchema.parse(req.body);

  const section = kit.sections[data.section] as any;
  if (!section) {
    throw new AppError(400, 'Invalid section');
  }

  if (section.pinned) {
    throw new AppError(409, 'Section is pinned and cannot be modified');
  }

  section.items = data.items;
  section.edited = data.edited ?? true;
  section.pinned = data.pinned ?? section.pinned;
  section.version += 1;

  if (data.order && data.section === 'questions') {
    section.order = data.order;
  }

  if (data.section === 'requirements') {
    kit.kitData.requirements = data.items as SharedKit['requirements'];
  } else if (data.section === 'questions') {
    kit.kitData.questions = data.items as SharedKit['questions'];
  } else if (data.section === 'flashcards') {
    kit.kitData.flashcards = data.items as SharedKit['flashcards'];
  } else if (data.section === 'schedule') {
    kit.kitData.schedule = { days_available: kit.kitData.schedule.days_available, days: data.items as SharedKit['schedule']['days'] };
  } else if (data.section === 'coverage') {
    kit.kitData.coverage = data.items[0] as SharedKit['coverage'];
  }

  await kit.save();
  res.json({ kit: serializeKit(kit) });
}));

router.post('/:id/sections/:section/regenerate', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const section = req.params['section'] as string;
  const data = regenerateSectionSchema.parse(req.body);

  if (!['requirements', 'questions', 'flashcards', 'schedule'].includes(section)) {
    throw new AppError(400, 'Invalid section for regeneration');
  }

  const sectionData = kit.sections[section as keyof typeof kit.sections] as any;
  if (!sectionData) {
    throw new AppError(400, 'Invalid section');
  }

  if (sectionData.pinned) {
    throw new AppError(409, 'Section is pinned and cannot be regenerated');
  }

  if (kit.status === 'generating') {
    throw new AppError(409, 'Generation already in progress');
  }

  const updatedJobDescription = data.jobDescription || kit.jobDescription;
  const updatedCompanyUrl = data.companyUrl || kit.companyUrl;
  const updatedDaysAvailable = data.daysAvailable || kit.daysAvailable;

  kit.status = 'generating';
  await kit.save();

  const job = await pipelineQueue.add({
    kitId: kit._id.toString(),
    userId: req.user!.id,
    jobDescription: updatedJobDescription,
    companyUrl: updatedCompanyUrl,
    daysAvailable: updatedDaysAvailable,
  });

  kit.lastRegeneratedAt = new Date();
  await kit.save();

  res.json({ jobId: job.id, status: 'started', section });
}));

router.post('/:id/sections/:section/pin', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  const { section } = req.params;
  const { pinned } = z.object({ pinned: z.boolean() }).parse(req.body);

  const sectionData = kit.sections[section as keyof typeof kit.sections] as any;
  if (!sectionData) {
    throw new AppError(400, 'Invalid section');
  }

  sectionData.pinned = pinned;
  await kit.save();
  res.json({ kit: serializeKit(kit) });
}));

router.post('/:id/generate', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;

  if (kit.status === 'generating') {
    throw new AppError(409, 'Generation already in progress');
  }

  kit.status = 'generating';
  await kit.save();

  const job = await pipelineQueue.add({
    kitId: kit._id.toString(),
    userId: req.user!.id,
    jobDescription: kit.jobDescription,
    companyUrl: kit.companyUrl,
    daysAvailable: kit.daysAvailable,
  });

  res.json({ jobId: job.id, status: 'started' });
}));

router.get('/:id/status', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const jobId = req.params['id'] as string;
  const job = await pipelineQueue.getJob(jobId);
  if (!job) {
    throw new AppError(404, 'Job not found');
  }
  res.json({ job: serializeJob(job) });
}));

router.delete('/:id', requireKitOwnership(), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit as IKit;
  await KitModel.findByIdAndDelete(kit._id);
  res.status(204).send();
}));

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

export { router as kitsRouter };