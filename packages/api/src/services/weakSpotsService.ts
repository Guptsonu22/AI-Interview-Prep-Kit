import { Requirement, Question, Flashcard } from '@interview-prep/shared';

export interface PracticeRecordLike {
  flashcardId: string;
  confidence: number;
  reviewedAt: Date | string;
}

export interface WeakSpotItem {
  requirementId: string;
  requirementText: string;
  category: string;
  priority: 'must' | 'nice';
  status: 'critical' | 'needs_practice' | 'proficient';
  urgencyScore: number;
  practiceCount: number;
  totalCards: number;
  averageConfidence: number | null;
  strugglingAttempts: number;
  linkedQuestionIds: string[];
  linkedQuestions: Array<{ id: string; prompt: string; category: string }>;
  linkedFlashcardIds: string[];
}

export interface WeakSpotsAnalysis {
  generatedAt: string;
  totalRequirements: number;
  weakSpotsCount: number;
  rankedWeakSpots: WeakSpotItem[];
  recommendedPractice: {
    recommendedFlashcardIds: string[];
    focusTopics: string[];
    summary: string;
  };
  disclaimer: string;
}

export function identifyWeakSpots(
  requirements: Requirement[] = [],
  questions: Question[] = [],
  flashcards: Flashcard[] = [],
  records: PracticeRecordLike[] = []
): WeakSpotsAnalysis {
  const recordMap = new Map<string, PracticeRecordLike>();
  for (const r of records) {
    recordMap.set(r.flashcardId, r);
  }

  // Active flashcard IDs set to filter out records of deleted cards
  const activeCardIds = new Set(flashcards.map((f) => f.id));

  const weakSpots: WeakSpotItem[] = [];

  for (const req of requirements) {
    const linkedQs = questions.filter((q) => (q.requirement_ids || []).includes(req.id));
    const linkedCards = flashcards.filter((f) => (f.requirement_ids || []).includes(req.id));

    let sumConfidence = 0;
    let reviewedCount = 0;
    let strugglingAttempts = 0;

    for (const card of linkedCards) {
      const rec = recordMap.get(card.id);
      if (rec) {
        reviewedCount++;
        sumConfidence += rec.confidence;
        if (rec.confidence < 3) {
          strugglingAttempts++;
        }
      }
    }

    const avgConfidence = reviewedCount > 0 ? parseFloat((sumConfidence / reviewedCount).toFixed(2)) : null;

    // Weight based on posting requirement priority
    const priorityWeight = req.priority === 'must' ? 2.5 : 1.0;

    // Severity factor
    let gapFactor: number;
    if (reviewedCount === 0) {
      gapFactor = 5.0; // Completely unreviewed
    } else {
      gapFactor = Math.max(0, 5.0 - (avgConfidence ?? 3) + strugglingAttempts * 0.75);
    }

    const urgencyScore = parseFloat((priorityWeight * gapFactor).toFixed(2));

    // Status classification
    let status: 'critical' | 'needs_practice' | 'proficient';
    if (req.priority === 'must' && (avgConfidence === null || avgConfidence < 3.0)) {
      status = 'critical';
    } else if (avgConfidence === null || avgConfidence < 3.8) {
      status = 'needs_practice';
    } else {
      status = 'proficient';
    }

    weakSpots.push({
      requirementId: req.id,
      requirementText: req.text,
      category: req.category || 'General',
      priority: req.priority,
      status,
      urgencyScore,
      practiceCount: reviewedCount,
      totalCards: linkedCards.length,
      averageConfidence: avgConfidence,
      strugglingAttempts,
      linkedQuestionIds: linkedQs.map((q) => q.id),
      linkedQuestions: linkedQs.map((q) => ({ id: q.id, prompt: q.prompt, category: q.category })),
      linkedFlashcardIds: linkedCards.map((f) => f.id),
    });
  }

  // Deterministic Ranking:
  // 1. Highest urgencyScore first
  // 2. 'must' before 'nice'
  // 3. Lowest averageConfidence (nulls/unreviewed first)
  // 4. Stable requirementId alphabetical tie-breaker
  weakSpots.sort((a, b) => {
    if (b.urgencyScore !== a.urgencyScore) {
      return b.urgencyScore - a.urgencyScore;
    }
    if (a.priority !== b.priority) {
      return a.priority === 'must' ? -1 : 1;
    }
    const confA = a.averageConfidence ?? -1;
    const confB = b.averageConfidence ?? -1;
    if (confA !== confB) {
      return confA - confB;
    }
    return a.requirementId.localeCompare(b.requirementId);
  });

  // Filter top weak spots to recommend targeted practice session
  const topWeakSpots = weakSpots.filter((ws) => ws.status === 'critical' || ws.status === 'needs_practice');

  const recommendedCardsSet = new Set<string>();
  const focusTopics: string[] = [];

  for (const ws of topWeakSpots.slice(0, 5)) {
    focusTopics.push(`${ws.category}: ${ws.requirementText.slice(0, 45)}...`);
    for (const fcId of ws.linkedFlashcardIds) {
      if (activeCardIds.has(fcId)) {
        recommendedCardsSet.add(fcId);
      }
    }
  }

  const recommendedFlashcardIds = Array.from(recommendedCardsSet);

  return {
    generatedAt: new Date().toISOString(),
    totalRequirements: requirements.length,
    weakSpotsCount: topWeakSpots.length,
    rankedWeakSpots: weakSpots,
    recommendedPractice: {
      recommendedFlashcardIds,
      focusTopics,
      summary:
        topWeakSpots.length > 0
          ? `Focus on ${topWeakSpots.length} prioritized topics with ${recommendedFlashcardIds.length} target flashcards.`
          : 'All must-have requirements have been practiced with solid confidence. Keep reviewing due cards.',
    },
    disclaimer:
      'Confidence ratings reflect candidate self-assessed familiarity and spaced repetition intervals. They do not constitute an objective external grading of interview answers.',
  };
}
