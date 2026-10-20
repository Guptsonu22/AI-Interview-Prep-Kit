import { Router } from 'express';
import { z } from 'zod';
import { KitModel } from '../../db/models';
import { Kit, PipelineInput, validateKit, checkCoverage, createEmptyContentStates } from '@interview-prep/shared';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { pipelineQueue } from '../../services/pipelineQueue';

const router = Router();

const createKitSchema = z.object({
  jobDescription: z.string().min(100),
  companyUrl: z.string().url(),
  prepDays: z.number().int().positive().max(90),
});

router.post('/', asyncHandler(async (req: AuthRequest, res) => {
  const data = createKitSchema.parse(req.body);

  const kit = await KitModel.create({
    userId: req.user!.id,
    jobDescription: data.jobDescription,
    companyUrl: data.companyUrl,
    prepDays: data.prepDays,
    kitData: {} as Kit,
    contentStates: {},
    status: 'draft',
  });

  res.status(201).json({ kit: serializeKit(kit) });
}));

router.get('/', asyncHandler(async (req: AuthRequest, res) => {
  const kits = await KitModel.find({ userId: req.user!.id })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ kits: kits.map(serializeKit) });
}));

router.get('/:id', asyncHandler(async (req: AuthRequest, res) => {
  const kit = await KitModel.findOne({ _id: req.params['id'], userId: req.user!.id }).lean();
  if (!kit) {
    throw new AppError(404, 'Kit not found');
  }
  res.json({ kit: serializeKit(kit) });
}));

router.patch('/:id', asyncHandler(async (req: AuthRequest, res) => {
  const kit = await KitModel.findOne({ _id: req.params['id'], userId: req.user!.id });
  if (!kit) {
    throw new AppError(404, 'Kit not found');
  }

  const updates = req.body;
  const currentKitData = kit.kitData as Kit;
  let updatedKitData = { ...currentKitData, ...updates.kitData };
  let contentStates = { ...kit.contentStates };

  if (updates.fieldPath && updates.fieldValue !== undefined) {
    const states = currentKitData.contentStates || createEmptyContentStates(currentKitData);
    contentStates[updates.fieldPath] = 'edited';
    setNestedValue(updatedKitData, updates.fieldPath, updates.fieldValue);
    contentStates = { ...states, ...contentStates };
  }

  if (updates.pinField) {
    contentStates[updates.pinField] = 'pinned';
  }

  const validation = validateKit(updatedKitData);
  if (!validation.success) {
    throw new AppError(400, 'Invalid kit data', validation.errors.errors);
  }

  kit.kitData = updatedKitData;
  kit.contentStates = contentStates;
  kit.updatedAt = new Date();
  await kit.save();

  res.json({ kit: serializeKit(kit) });
}));

router.post('/:id/generate', asyncHandler(async (req: AuthRequest, res) => {
  const kit = await KitModel.findOne({ _id: req.params['id'], userId: req.user!.id });
  if (!kit) {
    throw new AppError(404, 'Kit not found');
  }

  if (kit.status === 'generating') {
    throw new AppError(409, 'Generation already in progress');
  }

  kit.status = 'generating';
  await kit.save();

  const job = await pipelineQueue.add({
    kitId: kit._id.toString(),
    userId: req.user!.id,
    jobDescription: kit['jobDescription'],
    companyUrl: kit['companyUrl'],
    prepDays: kit['prepDays'],
  });

  res.json({ jobId: job.id, status: 'started' });
}));

router.get('/:id/status', asyncHandler(async (req: AuthRequest, res) => {
  const jobId = req.params['id'] as string;
  const job = await pipelineQueue.getJob(jobId);
  if (!job) {
    throw new AppError(404, 'Job not found');
  }
  res.json({ job: serializeJob(job) });
}));

function serializeKit(kit: unknown): Record<string, unknown> {
  const k = kit as { _id: { toString(): string }; userId: { toString(): string }; createdAt: Date; updatedAt: Date; [key: string]: unknown };
  return {
    id: k._id.toString(),
    userId: k.userId.toString(),
    jobDescription: k['jobDescription'],
    companyUrl: k['companyUrl'],
    prepDays: k['prepDays'],
    kitData: k['kitData'],
    contentStates: k['contentStates'],
    status: k['status'],
    createdAt: k.createdAt.toISOString(),
    updatedAt: k.updatedAt.toISOString(),
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

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  if (keys.length === 0) return;
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!key) continue;
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    const next = current[key];
    if (next && typeof next === 'object' && !Array.isArray(next)) {
      current = next as Record<string, unknown>;
    }
  }
  const lastKey = keys[keys.length - 1];
  if (lastKey) {
    current[lastKey] = value;
  }
}

export { router as kitsRouter };