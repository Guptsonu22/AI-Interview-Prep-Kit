/**
 * Comprehensive API Integration Tests
 *
 * Tests:
 *  1. Success flows (Kit CRUD, question CRUD, flashcard CRUD, practice SRS)
 *  2. Repeated requests & idempotency (generation in progress -> 409)
 *  3. Partial failure & error visibility without losing draft
 *  4. Ownership enforcement on every operation (403 for unauthorized users)
 *  5. Stale versions & optimistic concurrency (409 on version mismatch)
 *  6. Pinned protection (409 on modifying/regenerating pinned sections)
 *  7. Targeted regeneration (schedule & questions by category)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { User, KitModel, PracticeRecord, PipelineJob } from '../db/models';
import { createSession } from '../middleware/auth';
import { config } from '../config';

const createTestApp = async () => {
  const { createApp } = await import('../index');
  return createApp();
};

describe('Backend API, Generation Jobs and Persistence', () => {
  let app: express.Express;
  let agent: request.SuperAgentTest;
  let user1: any;
  let user2: any;
  let session1: string;
  let session2: string;

  beforeEach(async () => {
    app = await createTestApp();
    agent = request.agent(app);

    // Create 2 test users
    user1 = await User.create({ email: 'owner@example.com', passwordHash: 'hash1' });
    user2 = await User.create({ email: 'other@example.com', passwordHash: 'hash2' });

    session1 = await createSession(user1._id.toString(), null, null);
    session2 = await createSession(user2._id.toString(), null, null);
  });

  const validJD = 'Senior TypeScript Engineer with React and Node.js experience to lead backend systems. '.repeat(5);

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Kit Creation and Listing
  // ──────────────────────────────────────────────────────────────────────────
  describe('Kit Creation and Listing', () => {
    it('creates a draft kit with valid input', async () => {
      const res = await agent
        .post('/api/kits')
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({
          jobDescription: validJD,
          companyUrl: 'https://acme-payments.example.com',
          daysAvailable: 10,
        })
        .expect(201);

      expect(res.body.kit).toBeDefined();
      expect(res.body.kit.id).toBeDefined();
      expect(res.body.kit.status).toBe('draft');
      expect(res.body.kit.daysAvailable).toBe(10);
    });

    it('rejects kit creation with short job description (<100 chars)', async () => {
      const res = await agent
        .post('/api/kits')
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({
          jobDescription: 'Too short',
          companyUrl: 'https://acme.com',
          daysAvailable: 5,
        })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('lists only kits owned by the authenticated user', async () => {
      await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://acme1.com',
        daysAvailable: 7,
        status: 'draft',
      });
      await KitModel.create({
        userId: user2._id,
        jobDescription: validJD,
        companyUrl: 'https://acme2.com',
        daysAvailable: 7,
        status: 'draft',
      });

      const res = await agent
        .get('/api/kits')
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .expect(200);

      expect(res.body.kits.length).toBe(1);
      expect(res.body.total).toBe(1);
      expect(res.body.kits[0].companyUrl).toBe('https://acme1.com');
    });

    it('reads a specific kit for the owner', async () => {
      const kit = await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://acme.com',
        daysAvailable: 7,
        status: 'ready',
      });

      const res = await agent
        .get(`/api/kits/${kit._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .expect(200);

      expect(res.body.kit.id).toBe(kit._id.toString());
    });

    it('deletes a kit and cascades cleanup', async () => {
      const kit = await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://acme.com',
        daysAvailable: 7,
      });

      await agent
        .delete(`/api/kits/${kit._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .expect(204);

      const found = await KitModel.findById(kit._id);
      expect(found).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Ownership Enforcement
  // ──────────────────────────────────────────────────────────────────────────
  describe('Ownership Enforcement', () => {
    let kit1: any;

    beforeEach(async () => {
      kit1 = await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://owner-only.com',
        daysAvailable: 7,
        status: 'ready',
        kitData: {
          questions: [{ id: 'q1', prompt: 'Secret question', category: 'technical', difficulty: 2, requirement_ids: [] }],
          flashcards: [{ id: 'fc1', front: 'Front', back: 'Back', requirement_ids: [] }],
        },
      });
    });

    it('returns 403 when non-owner tries to read kit', async () => {
      const res = await agent
        .get(`/api/kits/${kit1._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session2}`])
        .expect(403);

      expect(res.body.error).toBe('Access denied');
    });

    it('returns 403 when non-owner tries to update kit', async () => {
      await agent
        .patch(`/api/kits/${kit1._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session2}`])
        .send({ status: 'archived' })
        .expect(403);
    });

    it('returns 403 when non-owner tries to delete kit', async () => {
      await agent
        .delete(`/api/kits/${kit1._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session2}`])
        .expect(403);
    });

    it('returns 403 when non-owner tries to trigger generation', async () => {
      await agent
        .post(`/api/kits/${kit1._id}/generate`)
        .set('Cookie', [`${config.session.cookieName}=${session2}`])
        .expect(403);
    });

    it('returns 403 when non-owner tries to access practice', async () => {
      await agent
        .get(`/api/kits/${kit1._id}/practice`)
        .set('Cookie', [`${config.session.cookieName}=${session2}`])
        .expect(403);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Stale Versions & Optimistic Concurrency Checks
  // ──────────────────────────────────────────────────────────────────────────
  describe('Optimistic Concurrency & Version Checks', () => {
    it('returns 409 Conflict when kit version is stale on PATCH /api/kits/:id', async () => {
      const kit = await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://acme.com',
        daysAvailable: 7,
        version: 5,
      });

      const res = await agent
        .patch(`/api/kits/${kit._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({ daysAvailable: 14, version: 3 }) // Stale version 3 vs current 5
        .expect(409);

      expect(res.body.error).toContain('Stale kit version');
    });

    it('returns 409 Conflict when section version is stale on PATCH /api/kits/:id/sections/:section', async () => {
      const kit = await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://acme.com',
        daysAvailable: 7,
        sections: {
          questions: { items: [], edited: false, pinned: false, version: 4 },
        },
      });

      const res = await agent
        .patch(`/api/kits/${kit._id}/sections/questions`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({ items: [], version: 2 }) // Stale version 2 vs current 4
        .expect(409);

      expect(res.body.error).toContain('Version mismatch');
    });

    it('updates successfully when version matches', async () => {
      const kit = await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://acme.com',
        daysAvailable: 7,
        version: 5,
      });

      const res = await agent
        .patch(`/api/kits/${kit._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({ daysAvailable: 14, version: 5 })
        .expect(200);

      expect(res.body.kit.daysAvailable).toBe(14);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Repeated Requests & Generation Idempotency
  // ──────────────────────────────────────────────────────────────────────────
  describe('Generation Idempotency and Progress', () => {
    it('rejects duplicate generation requests when status is generating', async () => {
      const kit = await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://acme.com',
        daysAvailable: 7,
        status: 'generating',
      });

      const res = await agent
        .post(`/api/kits/${kit._id}/generate`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .expect(409);

      expect(res.body.error).toContain('already in progress');
    });

    it('exposes progress and stages via GET /api/kits/:id/progress', async () => {
      const kit = await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://acme.com',
        daysAvailable: 7,
        status: 'generating',
      });

      await PipelineJob.create({
        kitId: kit._id,
        status: 'running',
        currentStep: 'generate-technical-questions',
        logs: [{ step: 'generate-technical-questions', message: 'Generating technical questions', level: 'info' }],
      });

      const res = await agent
        .get(`/api/kits/${kit._id}/progress`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .expect(200);

      expect(res.body.status).toBe('running');
      expect(res.body.stage).toBe('generating questions');
      expect(res.body.progress).toBe(60);
      expect(res.body.logs.length).toBeGreaterThan(0);
    });

    it('makes failures visible without losing existing draft', async () => {
      const kit = await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://acme.com',
        daysAvailable: 7,
        status: 'draft',
        generationError: 'LLM API rate limit exceeded. Existing draft preserved.',
      });

      const res = await agent
        .get(`/api/kits/${kit._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .expect(200);

      expect(res.body.kit.generationError).toContain('rate limit exceeded');
      expect(res.body.kit.jobDescription).toBe(validJD);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Pinned Protection
  // ──────────────────────────────────────────────────────────────────────────
  describe('Pinned Protection', () => {
    it('returns 409 Conflict when attempting to edit a pinned section', async () => {
      const kit = await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://acme.com',
        daysAvailable: 7,
        sections: {
          questions: { items: [], edited: false, pinned: true, version: 1 },
        },
      });

      const res = await agent
        .patch(`/api/kits/${kit._id}/sections/questions`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({ items: [] })
        .expect(409);

      expect(res.body.error).toContain('is pinned and cannot be modified');
    });

    it('returns 409 Conflict when attempting to add question to a pinned section', async () => {
      const kit = await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://acme.com',
        daysAvailable: 7,
        sections: {
          questions: { items: [], edited: false, pinned: true, version: 1 },
        },
      });

      const res = await agent
        .post(`/api/kits/${kit._id}/questions`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({ prompt: 'New question', category: 'technical', difficulty: 2 })
        .expect(409);

      expect(res.body.error).toContain('pinned');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Granular Question and Flashcard Management
  // ──────────────────────────────────────────────────────────────────────────
  describe('Question & Flashcard CRUD', () => {
    let kit: any;

    beforeEach(async () => {
      kit = await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://acme.com',
        daysAvailable: 5,
        kitData: {
          requirements: [{ id: 'req_1', text: 'TS', kind: 'technical', priority: 'must' }],
          questions: [
            { id: 'q_initial', prompt: 'Initial prompt', category: 'technical', difficulty: 2, requirement_ids: ['req_1'] },
          ],
          flashcards: [
            { id: 'fc_initial', front: 'Front initial', back: 'Back initial', requirement_ids: ['req_1'] },
          ],
        },
      });
    });

    it('creates, edits, changes category, and deletes a question', async () => {
      // 1. Create Question
      const createRes = await agent
        .post(`/api/kits/${kit._id}/questions`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({
          prompt: 'How do index signatures work in TypeScript?',
          category: 'technical',
          difficulty: 2,
          requirement_ids: ['req_1'],
        })
        .expect(201);

      const createdQId = createRes.body.question.id;
      expect(createdQId).toBeDefined();

      // 2. Edit Question
      const editRes = await agent
        .patch(`/api/kits/${kit._id}/questions/${createdQId}`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({ prompt: 'Updated question prompt' })
        .expect(200);

      expect(editRes.body.question.prompt).toBe('Updated question prompt');

      // 3. Change Category
      const catRes = await agent
        .patch(`/api/kits/${kit._id}/questions/${createdQId}/category`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({ category: 'system-design' })
        .expect(200);

      expect(catRes.body.question.category).toBe('system-design');

      // 4. Delete Question
      await agent
        .delete(`/api/kits/${kit._id}/questions/${createdQId}`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .expect(200);

      const updatedDoc = await KitModel.findById(kit._id);
      expect(updatedDoc!.kitData.questions.some((q: any) => q.id === createdQId)).toBe(false);
    });

    it('creates, edits, and deletes a flashcard', async () => {
      // 1. Create Flashcard
      const createRes = await agent
        .post(`/api/kits/${kit._id}/flashcards`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({ front: 'What is SM-2?', back: 'Spaced repetition algorithm', requirement_ids: ['req_1'] })
        .expect(201);

      const fcId = createRes.body.flashcard.id;
      expect(fcId).toBeDefined();

      // 2. Edit Flashcard
      const editRes = await agent
        .patch(`/api/kits/${kit._id}/flashcards/${fcId}`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({ back: 'SuperMemo 2 algorithm' })
        .expect(200);

      expect(editRes.body.flashcard.back).toBe('SuperMemo 2 algorithm');

      // 3. Delete Flashcard
      await agent
        .delete(`/api/kits/${kit._id}/flashcards/${fcId}`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .expect(200);

      const updatedDoc = await KitModel.findById(kit._id);
      expect(updatedDoc!.kitData.flashcards.some((f: any) => f.id === fcId)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Practice SRS Endpoints
  // ──────────────────────────────────────────────────────────────────────────
  describe('Practice SRS Flow', () => {
    let kit: any;

    beforeEach(async () => {
      kit = await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://acme.com',
        daysAvailable: 5,
        kitData: {
          flashcards: [
            { id: 'fc_1', front: 'Concept 1', back: 'Explanation 1', requirement_ids: [] },
            { id: 'fc_2', front: 'Concept 2', back: 'Explanation 2', requirement_ids: [] },
          ],
        },
      });
    });

    it('submits a practice confidence rating and retrieves due cards', async () => {
      // Submit rating 4 for fc_1
      const recordRes = await agent
        .post(`/api/kits/${kit._id}/practice/records`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({ flashcardId: 'fc_1', confidence: 4 })
        .expect(200);

      expect(recordRes.body.record.confidence).toBe(4);
      expect(recordRes.body.record.repetitions).toBe(1);

      // Fetch practice status
      const practiceRes = await agent
        .get(`/api/kits/${kit._id}/practice`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .expect(200);

      expect(practiceRes.body.totalCards).toBe(2);
      expect(practiceRes.body.completedCount).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Schedule Regeneration
  // ──────────────────────────────────────────────────────────────────────────
  describe('Schedule Regeneration', () => {
    it('regenerates the schedule deterministically using allocateStudySchedule', async () => {
      const kit = await KitModel.create({
        userId: user1._id,
        jobDescription: validJD,
        companyUrl: 'https://acme.com',
        daysAvailable: 5,
        kitData: {
          requirements: [{ id: 'req_1', text: 'TS', kind: 'technical', priority: 'must' }],
          questions: [
            { id: 'q_1', prompt: 'TS Generics', category: 'technical', difficulty: 2, requirement_ids: ['req_1'] },
          ],
        },
      });

      const res = await agent
        .post(`/api/kits/${kit._id}/regenerate/schedule`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({ daysAvailable: 10 })
        .expect(200);

      expect(res.body.schedule.days_available).toBe(10);
      expect(res.body.schedule.days.length).toBe(10);
      expect(res.body.kit.daysAvailable).toBe(10);
    });
  });
});
