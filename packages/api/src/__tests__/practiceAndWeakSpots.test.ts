import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { User, KitModel, PracticeRecord } from '../db/models';
import { createSession } from '../middleware/auth';
import { buildDeterministicReviewQueue } from '../services/practiceQueueService';
import { identifyWeakSpots } from '../services/weakSpotsService';
import { Kit as SharedKit } from '@interview-prep/shared';

const createTestApp = async () => {
  const { createApp } = await import('../index');
  return createApp();
};

describe('PROMPT 13 — Practice Mode and Weak-Spots Subsystem', () => {
  let app: express.Express;
  let user1: any;
  let user2: any;
  let session1: string;
  let session2: string;

  beforeEach(async () => {
    app = await createTestApp();

    user1 = await User.create({ email: 'candidate1@example.com', passwordHash: 'hash1' });
    user2 = await User.create({ email: 'candidate2@example.com', passwordHash: 'hash2' });

    session1 = await createSession(user1._id.toString(), null, null);
    session2 = await createSession(user2._id.toString(), null, null);
  });

  const sampleKitData: SharedKit = {
    version: '1.0',
    role: { title: 'Backend Architect', seniority: 'Senior', domain: 'Cloud' },
    company_brief: { name: 'Acme', summary: 'Cloud infra', what_they_do: 'PaaS', sources: ['https://acme.com'] },
    requirements: [
      { id: 'req-01', text: 'Proficiency in distributed consensus (Raft/Paxos)', category: 'Technical', priority: 'must' },
      { id: 'req-02', text: 'Experience with Kubernetes operator design', category: 'Technical', priority: 'must' },
      { id: 'req-03', text: 'Familiarity with gRPC streaming', category: 'Technical', priority: 'nice' },
    ],
    questions: [
      { id: 'q-01', prompt: 'Explain leader election in Raft', category: 'technical', difficulty: 3, answer_outline: 'Heartbeats and terms', requirement_ids: ['req-01'] },
      { id: 'q-02', prompt: 'How to write a custom K8s controller?', category: 'technical', difficulty: 3, answer_outline: 'Informer and workqueue', requirement_ids: ['req-02'] },
      { id: 'q-03', prompt: 'Difference between unary and bidirectional gRPC', category: 'technical', difficulty: 2, answer_outline: 'Protobuf HTTP/2 streams', requirement_ids: ['req-03'] },
    ],
    flashcards: [
      { id: 'fc-01', front: 'Raft split-vote resolution?', back: 'Randomized election timeouts.', requirement_ids: ['req-01'] },
      { id: 'fc-02', front: 'Kubernetes Informer cache mechanism?', back: 'Reflector and DeltaFIFO queue.', requirement_ids: ['req-02'] },
      { id: 'fc-03', front: 'gRPC transport layer protocol?', back: 'HTTP/2 framing.', requirement_ids: ['req-03'] },
      { id: 'fc-04', front: 'Raft log compaction method?', back: 'Periodic snapshotting to disk.', requirement_ids: ['req-01'] },
    ],
    schedule: {
      days_available: 5,
      days: [{ day: 1, focus: 'Distributed Consensus', minutes: 60, question_ids: ['q-01'] }],
    },
    coverage: {
      coverage_percentage: 100,
      must_have_coverage_percentage: 100,
      uncovered_must_haves: [],
    },
  };

  const createKitForUser = async (userId: any, overrides: Partial<any> = {}) => {
    return KitModel.create({
      userId,
      jobDescription: 'Senior Backend Architect with distributed systems background. '.repeat(5),
      companyUrl: 'https://acme.com',
      daysAvailable: 5,
      kitData: sampleKitData,
      status: 'ready',
      version: 1,
      ...overrides,
    });
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Confidence Persistence
  // ──────────────────────────────────────────────────────────────────────────
  it('persists confidence ratings, timestamps, intervals, and repetitions per user and kit', async () => {
    const kit = await createKitForUser(user1._id);

    // Save a rating of 2 (Hard)
    const res = await request(app)
      .post(`/api/kits/${kit._id}/practice/records`)
      .set('Cookie', [`sid=${session1}`])
      .send({ flashcardId: 'fc-01', confidence: 2 });

    expect(res.status).toBe(200);
    expect(res.body.record).toBeDefined();
    expect(res.body.record.confidence).toBe(2);
    expect(res.body.record.flashcardId).toBe('fc-01');

    // Verify in database
    const dbRecord = await PracticeRecord.findOne({
      userId: user1._id,
      kitId: kit._id,
      flashcardId: 'fc-01',
    });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.confidence).toBe(2);
    expect(dbRecord?.reviewedAt).toBeInstanceOf(Date);
    expect(dbRecord?.repetitions).toBe(0); // confidence < 3 resets repetitions in SM-2
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Deterministic Confidence-Weighted Ordering
  // ──────────────────────────────────────────────────────────────────────────
  it('implements deterministic confidence-weighted review queue prioritizing unreviewed and low-confidence cards', async () => {
    const kit = await createKitForUser(user1._id);

    // User reviews fc-01 with Easy (5)
    await request(app)
      .post(`/api/kits/${kit._id}/practice/records`)
      .set('Cookie', [`sid=${session1}`])
      .send({ flashcardId: 'fc-01', confidence: 5 });

    // User reviews fc-03 with Again (1)
    await request(app)
      .post(`/api/kits/${kit._id}/practice/records`)
      .set('Cookie', [`sid=${session1}`])
      .send({ flashcardId: 'fc-03', confidence: 1 });

    // fc-02 and fc-04 remain unreviewed!

    const res = await request(app)
      .get(`/api/kits/${kit._id}/practice`)
      .set('Cookie', [`sid=${session1}`]);

    expect(res.status).toBe(200);
    const returnedCards = res.body.flashcards;

    // Queue ordering rules:
    // 1. Unreviewed cards first (fc-02, fc-04 sorted alphabetically)
    // 2. Low confidence cards (fc-03 with confidence 1)
    // 3. High confidence cards (fc-01 with confidence 5)
    expect(returnedCards.map((c: any) => c.id)).toEqual(['fc-02', 'fc-04', 'fc-03', 'fc-01']);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Unreviewed Cards & Overall Deck Coverage Tracking
  // ──────────────────────────────────────────────────────────────────────────
  it('correctly tracks reviewed count, unreviewed count, and deck coverage percentage', async () => {
    const kit = await createKitForUser(user1._id);

    // Initial state: 0 reviewed, 4 unreviewed, 0% coverage
    let res = await request(app)
      .get(`/api/kits/${kit._id}/practice`)
      .set('Cookie', [`sid=${session1}`]);

    expect(res.body.totalCards).toBe(4);
    expect(res.body.reviewedCount).toBe(0);
    expect(res.body.unreviewedCount).toBe(4);
    expect(res.body.overallCoverage).toBe(0);

    // Review 2 cards
    await request(app)
      .post(`/api/kits/${kit._id}/practice/records`)
      .set('Cookie', [`sid=${session1}`])
      .send({ flashcardId: 'fc-01', confidence: 4 });

    await request(app)
      .post(`/api/kits/${kit._id}/practice/records`)
      .set('Cookie', [`sid=${session1}`])
      .send({ flashcardId: 'fc-02', confidence: 3 });

    res = await request(app)
      .get(`/api/kits/${kit._id}/practice`)
      .set('Cookie', [`sid=${session1}`]);

    expect(res.body.totalCards).toBe(4);
    expect(res.body.reviewedCount).toBe(2);
    expect(res.body.unreviewedCount).toBe(2);
    expect(res.body.overallCoverage).toBe(50);
    expect(res.body.masteryCount).toBe(2);
    expect(res.body.masteryRate).toBe(50);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Deleted Cards Handling
  // ──────────────────────────────────────────────────────────────────────────
  it('does not include deleted cards in the practice review queue', async () => {
    const kit = await createKitForUser(user1._id);

    // Record review for fc-01 and fc-02
    await request(app)
      .post(`/api/kits/${kit._id}/practice/records`)
      .set('Cookie', [`sid=${session1}`])
      .send({ flashcardId: 'fc-01', confidence: 3 });

    await request(app)
      .post(`/api/kits/${kit._id}/practice/records`)
      .set('Cookie', [`sid=${session1}`])
      .send({ flashcardId: 'fc-02', confidence: 3 });

    // Now delete fc-01 from kitData.flashcards
    kit.kitData.flashcards = kit.kitData.flashcards.filter((f) => f.id !== 'fc-01');
    kit.markModified('kitData');
    await kit.save();

    const res = await request(app)
      .get(`/api/kits/${kit._id}/practice`)
      .set('Cookie', [`sid=${session1}`]);

    expect(res.status).toBe(200);
    const cardIds = res.body.flashcards.map((f: any) => f.id);
    expect(cardIds).not.toContain('fc-01');
    expect(res.body.totalCards).toBe(3);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Empty Practice Decks
  // ──────────────────────────────────────────────────────────────────────────
  it('handles empty practice decks gracefully without crashing', async () => {
    const kit = await createKitForUser(user1._id);
    kit.kitData.flashcards = [];
    kit.markModified('kitData');
    await kit.save();

    const res = await request(app)
      .get(`/api/kits/${kit._id}/practice`)
      .set('Cookie', [`sid=${session1}`]);

    expect(res.status).toBe(200);
    expect(res.body.flashcards).toEqual([]);
    expect(res.body.totalCards).toBe(0);
    expect(res.body.reviewedCount).toBe(0);
    expect(res.body.unreviewedCount).toBe(0);
    expect(res.body.overallCoverage).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. User Isolation
  // ──────────────────────────────────────────────────────────────────────────
  it('enforces strict user isolation on practice records and kit endpoints', async () => {
    const kitUser1 = await createKitForUser(user1._id);

    // User 1 reviews card fc-01
    await request(app)
      .post(`/api/kits/${kitUser1._id}/practice/records`)
      .set('Cookie', [`sid=${session1}`])
      .send({ flashcardId: 'fc-01', confidence: 5 });

    // User 2 attempts to view User 1's practice queue -> 403 Forbidden
    const unauthGet = await request(app)
      .get(`/api/kits/${kitUser1._id}/practice`)
      .set('Cookie', [`sid=${session2}`]);
    expect(unauthGet.status).toBe(403);

    // User 2 attempts to post a practice record on User 1's kit -> 403 Forbidden
    const unauthPost = await request(app)
      .post(`/api/kits/${kitUser1._id}/practice/records`)
      .set('Cookie', [`sid=${session2}`])
      .send({ flashcardId: 'fc-01', confidence: 1 });
    expect(unauthPost.status).toBe(403);

    // User 2 has their own kit with the same flashcards
    const kitUser2 = await createKitForUser(user2._id);
    const user2Practice = await request(app)
      .get(`/api/kits/${kitUser2._id}/practice`)
      .set('Cookie', [`sid=${session2}`]);

    // For user 2, fc-01 must still be unreviewed (User 1's review does not bleed over)
    const fc01ForUser2 = user2Practice.body.flashcards.find((f: any) => f.id === 'fc-01');
    expect(fc01ForUser2.isUnreviewed).toBe(true);
    expect(fc01ForUser2.confidence).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Weak Spots Feature
  // ──────────────────────────────────────────────────────────────────────────
  it('identifies unreviewed or struggling must-have requirements as critical weak spots', async () => {
    const kit = await createKitForUser(user1._id);

    // User reviews gRPC (req-03 nice-to-have) with high confidence (5)
    await request(app)
      .post(`/api/kits/${kit._id}/practice/records`)
      .set('Cookie', [`sid=${session1}`])
      .send({ flashcardId: 'fc-03', confidence: 5 });

    // User struggles on Raft (req-01 must-have) with confidence 1
    await request(app)
      .post(`/api/kits/${kit._id}/practice/records`)
      .set('Cookie', [`sid=${session1}`])
      .send({ flashcardId: 'fc-01', confidence: 1 });

    // K8s (req-02 must-have) is unreviewed!

    const res = await request(app)
      .get(`/api/kits/${kit._id}/weak-spots`)
      .set('Cookie', [`sid=${session1}`]);

    expect(res.status).toBe(200);
    expect(res.body.rankedWeakSpots).toBeDefined();

    const spots = res.body.rankedWeakSpots;
    // Must-have requirements (req-01 and req-02) should rank as critical
    const criticalReqs = spots.filter((s: any) => s.status === 'critical');
    expect(criticalReqs.length).toBeGreaterThanOrEqual(2);

    // Check that topics link to questions and flashcards
    const raftSpot = spots.find((s: any) => s.requirementId === 'req-01');
    expect(raftSpot).toBeDefined();
    expect(raftSpot.linkedQuestionIds).toContain('q-01');
    expect(raftSpot.linkedFlashcardIds).toContain('fc-01');
    expect(raftSpot.strugglingAttempts).toBe(1);

    // Recommended practice deck must contain target flashcards
    expect(res.body.recommendedPractice.recommendedFlashcardIds).toContain('fc-01');
    expect(res.body.disclaimer).toMatch(/candidate self-assessed/i);
  });
});
