import { Flashcard } from '@interview-prep/shared';

export interface PracticeRecordLike {
  flashcardId: string;
  confidence: number;
  reviewedAt: Date | string;
  nextReviewAt?: Date | string;
}

export interface PracticeQueueItem extends Flashcard {
  confidence: number | null;
  reviewedAt: string | null;
  isUnreviewed: boolean;
  priorityBucket: number;
}

export interface PracticeQueueResult {
  flashcards: PracticeQueueItem[];
  totalCards: number;
  reviewedCount: number;
  unreviewedCount: number;
  overallCoverage: number; // percentage of deck that has been reviewed at least once
  masteryCount: number; // cards with confidence >= 3
  masteryRate: number;
  lastReviewedCardId: string | null;
}

/**
 * Deterministic Confidence-Weighted Review Queue
 *
 * Ordering Strategy:
 * 1. Unreviewed cards have highest priority (Bucket 0) to ensure complete deck exposure.
 * 2. Reviewed cards with low confidence come next:
 *    - Confidence 0 (Again / Blackout) -> Bucket 1
 *    - Confidence 1 (Again / Wrong)    -> Bucket 2
 *    - Confidence 2 (Hard)             -> Bucket 3
 *    - Confidence 3 (Good)             -> Bucket 4
 *    - Confidence 4 (Easy)             -> Bucket 5
 *    - Confidence 5 (Perfect)          -> Bucket 6
 * 3. Secondary Tie-Breaker: Oldest reviewedAt timestamp first (least recently reviewed).
 * 4. Tertiary Tie-Breaker: Stable Card ID ascending (localeCompare) to guarantee 100% deterministic order.
 */
export function buildDeterministicReviewQueue(
  flashcards: Flashcard[] = [],
  records: PracticeRecordLike[] = []
): PracticeQueueResult {
  if (!flashcards || flashcards.length === 0) {
    return {
      flashcards: [],
      totalCards: 0,
      reviewedCount: 0,
      unreviewedCount: 0,
      overallCoverage: 0,
      masteryCount: 0,
      masteryRate: 0,
      lastReviewedCardId: null,
    };
  }

  const recordMap = new Map<string, PracticeRecordLike>();
  let latestReviewDate: Date | null = null;
  let lastReviewedCardId: string | null = null;

  for (const r of records) {
    recordMap.set(r.flashcardId, r);
    const rDate = new Date(r.reviewedAt);
    if (!latestReviewDate || rDate > latestReviewDate) {
      latestReviewDate = rDate;
      lastReviewedCardId = r.flashcardId;
    }
  }

  let reviewedCount = 0;
  let masteryCount = 0;

  const queueItems: PracticeQueueItem[] = flashcards.map((card) => {
    const record = recordMap.get(card.id);
    const isUnreviewed = !record;
    let priorityBucket: number;

    if (isUnreviewed) {
      priorityBucket = 0;
    } else {
      reviewedCount++;
      if (record.confidence >= 3) {
        masteryCount++;
      }
      // Buckets 1 to 6 mapped from confidence 0 to 5
      priorityBucket = record.confidence + 1;
    }

    return {
      ...card,
      confidence: record ? record.confidence : null,
      reviewedAt: record ? new Date(record.reviewedAt).toISOString() : null,
      isUnreviewed,
      priorityBucket,
    };
  });

  // Deterministic sorting
  queueItems.sort((a, b) => {
    // 1. Priority bucket (Unreviewed first, then lowest confidence)
    if (a.priorityBucket !== b.priorityBucket) {
      return a.priorityBucket - b.priorityBucket;
    }

    // 2. Secondary tie-breaker: least recently reviewed first
    if (!a.isUnreviewed && !b.isUnreviewed && a.reviewedAt && b.reviewedAt) {
      const timeA = new Date(a.reviewedAt).getTime();
      const timeB = new Date(b.reviewedAt).getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }
    }

    // 3. Tertiary deterministic tie-breaker: ID alphabetical
    return a.id.localeCompare(b.id);
  });

  const totalCards = flashcards.length;
  const unreviewedCount = totalCards - reviewedCount;
  const overallCoverage = totalCards > 0 ? parseFloat(((reviewedCount / totalCards) * 100).toFixed(1)) : 0;
  const masteryRate = totalCards > 0 ? parseFloat(((masteryCount / totalCards) * 100).toFixed(1)) : 0;

  return {
    flashcards: queueItems,
    totalCards,
    reviewedCount,
    unreviewedCount,
    overallCoverage,
    masteryCount,
    masteryRate,
    lastReviewedCardId,
  };
}
