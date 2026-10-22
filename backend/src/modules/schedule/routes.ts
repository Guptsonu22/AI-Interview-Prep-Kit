import { Router } from 'express';
import { z } from 'zod';
import { KitModel } from '../../db/models';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { requireKitOwnership } from '../../middleware/ownership';
import pino from 'pino';

const logger = pino({ name: 'schedule-routes' });
const router = Router();

router.get('/:kitId', requireKitOwnership('kitId'), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit;

  const schedule = kit.kitData?.schedule?.days || [];
  const metadata = {
    daysAvailable: kit.kitData?.schedule?.days_available || kit.daysAvailable,
    totalEstimatedMinutes: schedule.reduce((sum: number, d: any) => sum + (d.minutes || 0), 0),
  };

  res.json({
    schedule,
    ...metadata,
  });
}));

const updateDaySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string().optional(),
  questionIds: z.array(z.string()).optional(),
  minutes: z.number().int().positive().max(480).optional(),
});

router.patch('/:kitId/days/:day', requireKitOwnership('kitId'), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit;
  const dayNum = parseInt(req.params['day'] ?? '', 10);
  const data = updateDaySchema.parse({ ...req.body, day: dayNum });

  const schedule = kit.kitData?.schedule;
  if (!schedule || !schedule.days) {
    throw new AppError(400, 'Schedule not found');
  }

  const dayIndex = schedule.days.findIndex((d: any) => d.day === dayNum);
  if (dayIndex === -1) {
    throw new AppError(404, 'Day not found');
  }

  if (data.focus !== undefined) schedule.days[dayIndex].focus = data.focus;
  if (data.questionIds !== undefined) schedule.days[dayIndex].question_ids = data.questionIds;
  if (data.minutes !== undefined) schedule.days[dayIndex].minutes = data.minutes;

  kit.sections.schedule.edited = true;
  kit.sections.schedule.version += 1;
  await kit.save();

  logger.info({ userId: req.user!.id, kitId: kit._id.toString(), day: dayNum }, 'Schedule day updated');

  res.json({ schedule: kit.kitData.schedule });
}));

router.post('/:kitId/regenerate', requireKitOwnership('kitId'), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit;

  if (kit.status === 'generating') {
    throw new AppError(409, 'Generation already in progress');
  }

  const { pipelineQueue } = await import('../../services/pipelineQueue.js');

  kit.status = 'generating';
  await kit.save();

  const job = await pipelineQueue.add({
    kitId: kit._id.toString(),
    userId: req.user!.id,
    jobDescription: kit.jobDescription,
    companyUrl: kit.companyUrl,
    daysAvailable: kit.daysAvailable,
  });

  kit.lastRegeneratedAt = new Date();
  await kit.save();

  res.json({ jobId: job.id, status: 'started', section: 'schedule' });
}));

router.post('/:kitId/reorder', requireKitOwnership('kitId'), asyncHandler(async (req: AuthRequest, res) => {
  const kit = (req as any).kit;
  const { questionOrder } = z.object({ questionOrder: z.array(z.string()) }).parse(req.body);

  if (!kit.kitData?.schedule?.days) {
    throw new AppError(400, 'Schedule not found');
  }

  const questionIds = new Set(questionOrder);
  for (const day of kit.kitData.schedule.days) {
    day.question_ids = day.question_ids.filter((qid: string) => questionIds.has(qid));
  }

  kit.sections.schedule.edited = true;
  kit.sections.schedule.version += 1;
  await kit.save();

  logger.info({ userId: req.user!.id, kitId: kit._id.toString() }, 'Schedule questions reordered');

  res.json({ schedule: kit.kitData.schedule });
}));

export { router as scheduleRouter };