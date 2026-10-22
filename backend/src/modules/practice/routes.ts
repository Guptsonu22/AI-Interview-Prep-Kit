import { Router } from 'express';
import { z } from 'zod';
import { PracticeRecord } from '../../db/models';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { requirePracticeOwnership } from '../../middleware/ownership';
import pino from 'pino';
import { Types } from 'mongoose';

const logger = pino({ name: 'practice-routes' });
const router = Router();

const recordSchema = z.object({
  flashcardId: z.string(),
  confidence: z.number().int().min(0).max(5),
});

router.post('/kit/:kitId/record', requirePracticeOwnership('kitId'), asyncHandler(async (req: AuthRequest, res) => {
  const { flashcardId, confidence } = recordSchema.parse(req.body);
  const kitId = req.params['kitId'];
  const conf = confidence as 0 | 1 | 2 | 3 | 4 | 5;
  const now = new Date();

  let record = await PracticeRecord.findOne({ userId: req.user!.id, kitId, flashcardId });

  if (!record) {
    record = new PracticeRecord({
      userId: req.user!.id,
      kitId,
      flashcardId,
      confidence: conf,
      reviewedAt: now,
      nextReviewAt: now,
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
    });
  }

  const { interval, easeFactor, repetitions } = record;

  if (conf >= 3) {
    let newInterval: number;
    if (repetitions === 0) newInterval = 1;
    else if (repetitions === 1) newInterval = 6;
    else newInterval = Math.round(interval * easeFactor);

    const newEaseFactor = Math.max(1.3, easeFactor + 0.1 - (5 - conf) * (0.08 + (5 - conf) * 0.02));
    record.interval = newInterval;
    record.easeFactor = newEaseFactor;
    record.repetitions = repetitions + 1;
  } else {
    record.interval = 1;
    record.easeFactor = Math.max(1.3, easeFactor - 0.2);
    record.repetitions = 0;
  }

  record.confidence = conf;
  record.reviewedAt = now;
  record.nextReviewAt = new Date(now.getTime() + record.interval * 60 * 60 * 1000);
  await record.save();

  logger.info({ userId: req.user!.id, kitId, flashcardId, confidence }, 'Practice record created/updated');

  res.json({ record: serializeRecord(record) });
}));

router.get('/kit/:kitId/due', requirePracticeOwnership('kitId'), asyncHandler(async (req: AuthRequest, res) => {
  const { kitId } = req.params;
  const limit = Math.min(parseInt((req.query['limit'] as string) || '20', 10), 100);

  const records = await PracticeRecord.find({
    userId: req.user!.id,
    kitId,
    nextReviewAt: { $lte: new Date() },
  })
    .sort({ nextReviewAt: 1 })
    .limit(limit)
    .lean();

  res.json({ records: records.map(serializeRecord) });
}));

router.get('/kit/:kitId/upcoming', requirePracticeOwnership('kitId'), asyncHandler(async (req: AuthRequest, res) => {
  const { kitId } = req.params;
  const limit = Math.min(parseInt((req.query['limit'] as string) || '20', 10), 100);
  const days = Math.min(parseInt((req.query['days'] as string) || '7', 10), 30);

  const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const records = await PracticeRecord.find({
    userId: req.user!.id,
    kitId,
    nextReviewAt: { $gt: new Date(), $lte: futureDate },
  })
    .sort({ nextReviewAt: 1 })
    .limit(limit)
    .lean();

  res.json({ records: records.map(serializeRecord) });
}));

router.get('/kit/:kitId/history', requirePracticeOwnership('kitId'), asyncHandler(async (req: AuthRequest, res) => {
  const { kitId } = req.params;
  const limit = Math.min(parseInt((req.query['limit'] as string) || '50', 10), 200);
  const offset = parseInt((req.query['offset'] as string) || '0', 10);

  const records = await PracticeRecord.find({ userId: req.user!.id, kitId })
    .sort({ reviewedAt: -1 })
    .skip(offset)
    .limit(limit)
    .lean();

  const total = await PracticeRecord.countDocuments({ userId: req.user!.id, kitId });

  res.json({ records: records.map(serializeRecord), total });
}));

router.get('/kit/:kitId/stats', requirePracticeOwnership('kitId'), asyncHandler(async (req: AuthRequest, res) => {
  const { kitId } = req.params;

  const total = await PracticeRecord.countDocuments({ userId: req.user!.id, kitId });
  const due = await PracticeRecord.countDocuments({
    userId: req.user!.id,
    kitId,
    nextReviewAt: { $lte: new Date() },
  });
  const completed = await PracticeRecord.countDocuments({
    userId: req.user!.id,
    kitId,
    confidence: { $gte: 3 },
  });

  const stats = await PracticeRecord.aggregate([
    { $match: { userId: req.user!.id, kitId: new Types.ObjectId(kitId) } },
    {
      $group: {
        _id: '$confidence',
        count: { $sum: 1 },
        avgEaseFactor: { $avg: '$easeFactor' },
        avgInterval: { $avg: '$interval' },
      },
    },
  ]);

  const byConfidence = stats.reduce((acc, s) => {
    acc[s._id] = { count: s.count, avgEaseFactor: s.avgEaseFactor, avgInterval: s.avgInterval };
    return acc;
  }, {} as Record<number, { count: number; avgEaseFactor: number; avgInterval: number }>);

  const avgEaseFactor = await PracticeRecord.aggregate([
    { $match: { userId: req.user!.id, kitId: new Types.ObjectId(kitId) } },
    { $group: { _id: null, avg: { $avg: '$easeFactor' } } },
  ]);

  res.json({
    total,
    due,
    completed,
    completionRate: total > 0 ? completed / total : 0,
    avgEaseFactor: avgEaseFactor[0]?.avg || 2.5,
    byConfidence,
  });
}));

router.delete('/kit/:kitId/flashcard/:flashcardId', requirePracticeOwnership('kitId'), asyncHandler(async (req: AuthRequest, res) => {
  const { kitId, flashcardId } = req.params;

  await PracticeRecord.findOneAndDelete({ userId: req.user!.id, kitId, flashcardId });

  logger.info({ userId: req.user!.id, kitId, flashcardId }, 'Practice record deleted');

  res.status(204).send();
}));

router.delete('/kit/:kitId', requirePracticeOwnership('kitId'), asyncHandler(async (req: AuthRequest, res) => {
  const { kitId } = req.params;

  await PracticeRecord.deleteMany({ userId: req.user!.id, kitId });

  logger.info({ userId: req.user!.id, kitId }, 'All practice records for kit deleted');

  res.status(204).send();
}));

function serializeRecord(record: any) {
  return {
    id: record._id.toString(),
    flashcardId: record.flashcardId,
    confidence: record.confidence,
    interval: record.interval,
    easeFactor: record.easeFactor,
    repetitions: record.repetitions,
    reviewedAt: record.reviewedAt.toISOString(),
    nextReviewAt: record.nextReviewAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export { router as practiceRouter };