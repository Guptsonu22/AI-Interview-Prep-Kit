import { Router } from 'express';
import { z } from 'zod';
import { Flashcard } from '../../db/models';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler, AppError } from '../../middleware/errorHandler';

const router = Router();

const reviewSchema = z.object({
  flashcardId: z.string(),
  confidence: z.number().int().min(0).max(5),
});

router.post('/review', asyncHandler(async (req: AuthRequest, res) => {
  const { flashcardId, confidence } = reviewSchema.parse(req.body);

  const flashcard = await Flashcard.findOne({ _id: flashcardId }).populate<{ kitId: { userId: { toString(): string } } }>('kitId');
  if (!flashcard) {
    throw new AppError(404, 'Flashcard not found');
  }

  const kit = flashcard.kitId;
  if (!kit || kit.userId.toString() !== req.user!.id) {
    throw new AppError(403, 'Not authorized');
  }

  const now = new Date();
  let { interval, easeFactor } = flashcard;

  if (confidence >= 3) {
    if (interval === 1) interval = 6;
    else if (interval === 6) interval = 24;
    else interval = Math.round(interval * easeFactor);
    easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - confidence) * (0.08 + (5 - confidence) * 0.02));
  } else {
    interval = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  }

  const nextReview = new Date(now.getTime() + interval * 60 * 60 * 1000);

  flashcard.confidence = confidence;
  flashcard.interval = interval;
  flashcard.easeFactor = easeFactor;
  flashcard.nextReview = nextReview;
  flashcard.updatedAt = now;
  await flashcard.save();

  res.json({
    flashcard: {
      id: flashcard._id.toString(),
      confidence: flashcard.confidence,
      interval: flashcard.interval,
      easeFactor: flashcard.easeFactor,
      nextReview: flashcard.nextReview.toISOString(),
    },
  });
}));

router.get('/kit/:kitId/due', asyncHandler(async (req: AuthRequest, res) => {
  const { kitId } = req.params;
  const limit = parseInt((req.query['limit'] as string) || '20', 10);

  const flashcards = await Flashcard.find({
    kitId,
    nextReview: { $lte: new Date() },
  })
    .sort({ nextReview: 1 })
    .limit(limit)
    .lean();

  res.json({ flashcards: flashcards.map((f) => ({
    id: f._id.toString(),
    question: f.question,
    answer: f.answer,
    tags: f.tags,
    category: f.category,
    difficulty: f.difficulty,
    confidence: f.confidence,
    nextReview: f.nextReview.toISOString(),
  })) });
}));

export { router as flashcardsRouter };