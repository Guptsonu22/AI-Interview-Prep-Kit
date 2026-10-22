import { Router } from 'express';
import { z } from 'zod';
import { KitModel, PracticeRecord } from '../../db/models';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { requireKitOwnership, requirePracticeOwnership } from '../../middleware/ownership';
import pino from 'pino';
import { Types } from 'mongoose';

const logger = pino({ name: 'flashcards-routes' });
const router = Router();

const reviewSchema = z.object({
  flashcardId: z.string(),
  confidence: z.number().int().min(0).max(5),
});

const batchReviewSchema = z.object({
  reviews: z.array(z.object({
    flashcardId: z.string(),
    confidence: z.number().int().min(0).max(5),
  })).min(1).max(100),
});

router.post('/kit/:kitId/review', requirePracticeOwnership('kitId'), asyncHandler(async (req: AuthRequest, res) => {
  const { flashcardId, confidence } = reviewSchema.parse(req.body);
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

  logger.info({ userId: req.user!.id, kitId, flashcardId, confidence: conf }, 'Flashcard reviewed');

  res.json({
    record: serializePracticeRecord(record),
  });
}));

router.post('/kit/:kitId/batch-review', requirePracticeOwnership('kitId'), asyncHandler(async (req: AuthRequest, res) => {
  const { reviews } = batchReviewSchema.parse(req.body);
  const kitId = req.params['kitId'];
  const now = new Date();

  const records = await PracticeRecord.find({
    userId: req.user!.id,
    kitId,
    flashcardId: { $in: reviews.map(r => r.flashcardId) },
  });

  const recordMap = new Map(records.map(r => [r.flashcardId, r]));
  const updatedRecords = [];

  for (const { flashcardId, confidence } of reviews) {
    const conf = confidence as 0 | 1 | 2 | 3 | 4 | 5;
    let record = recordMap.get(flashcardId);

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
      recordMap.set(flashcardId, record);
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
    updatedRecords.push(record);
  }

  await Promise.all(updatedRecords.map(r => r.save()));

  logger.info({ userId: req.user!.id, kitId, count: updatedRecords.length }, 'Batch flashcard review');

  res.json({
    records: updatedRecords.map(serializePracticeRecord),
  });
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

  const kit = await KitModel.findById(kitId).select('kitData').lean();
  const flashcards = kit?.kitData?.flashcards || [];
  const flashcardMap = new Map(flashcards.map((f: any) => [f.id, f]));

  const dueFlashcards = records.map(record => {
    const flashcard = flashcardMap.get(record.flashcardId);
    return {
      ...serializePracticeRecord(record),
      front: flashcard?.front,
      back: flashcard?.back,
      requirementIds: flashcard?.requirement_ids,
    };
  });

  res.json({ flashcards: dueFlashcards });
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

  res.json({ records: records.map(serializePracticeRecord), total });
}));

router.get('/kit/:kitId/stats', requirePracticeOwnership('kitId'), asyncHandler(async (req: AuthRequest, res) => {
  const { kitId } = req.params;

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

  const total = await PracticeRecord.countDocuments({ userId: req.user!.id, kitId });
  const due = await PracticeRecord.countDocuments({
    userId: req.user!.id,
    kitId,
    nextReviewAt: { $lte: new Date() },
  });

  res.json({
    total,
    due,
    byConfidence: stats.reduce((acc, s) => {
      acc[s._id] = { count: s.count, avgEaseFactor: s.avgEaseFactor, avgInterval: s.avgInterval };
      return acc;
    }, {} as Record<number, { count: number; avgEaseFactor: number; avgInterval: number }>),
  });
}));

function serializePracticeRecord(record: any) {
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

export { router as flashcardsRouter };