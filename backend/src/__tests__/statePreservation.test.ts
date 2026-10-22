/**
 * Regression Tests for State-Preservation Model (Prompt 9)
 *
 * Verifies that:
 * 1. Editing a behavioural question survives technical-category regeneration.
 * 2. Editing a technical question survives technical-category regeneration.
 * 3. A hand-created question survives regeneration of its category.
 * 4. A pinned question survives regeneration.
 * 5. Reordering survives unrelated regeneration.
 * 6. Company brief regeneration does not overwrite manual question edits.
 * 7. Schedule regeneration does not overwrite unrelated user edits.
 * 8. Concurrent stale updates do not silently clobber work (optimistic concurrency).
 * 9. Safe removal of stale requirement references if requirements are changed.
 * 10. Schedule references are synchronized when questions are deleted.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { User, KitModel, PracticeRecord } from '../db/models';
import { createSession } from '../middleware/auth';
import { config } from '../config';
import { validateKitReferences } from '@interview-prep/shared';

// Mock LLM generation functions so tests run deterministically and fast
vi.mock('../llm', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    generateQuestionsForRequirement: vi.fn().mockImplementation(async (req, category) => [
      {
        id: `q_mock_${category}_fresh`,
        prompt: `Mock freshly generated question for ${category}`,
        category,
        requirement_ids: [req.id],
        difficulty: 2,
        answer_outline: 'Outline for freshly generated question',
        provenance: 'generated',
        edited: false,
        pinned: false,
      },
    ]),
    generateCompanyBrief: vi.fn().mockResolvedValue({
      summary: 'Mock regenerated company brief',
      what_they_do: 'Mock regenerated activities',
      sources: ['https://example.com/about'],
    }),
    getDefaultLLMClient: vi.fn().mockReturnValue({}),
  };
});

const createTestApp = async () => {
  const { createApp } = await import('../index');
  return createApp();
};

describe('State-Preservation Model (Prompt 9)', () => {
  let app: express.Express;
  let agent: request.SuperAgentTest;
  let user: any;
  let sessionToken: string;

  const validJD = 'Senior TypeScript Engineer responsible for backend systems and Node.js microservices. '.repeat(5);

  beforeEach(async () => {
    app = await createTestApp();
    agent = request.agent(app);

    user = await User.create({ email: 'preservation@example.com', passwordHash: 'hash' });
    sessionToken = await createSession(user._id.toString(), null, null);
  });

  const makeBaseKitData = () => ({
    source: {
      url: 'https://example.com/jobs/1',
      title: 'Senior Engineer',
      job_description: validJD,
      retrieved_at: new Date().toISOString(),
    },
    company_brief: {
      summary: 'Tech company providing modern cloud solutions.',
      what_they_do: 'Cloud infrastructure platforms.',
      sources: ['https://example.com'],
    },
    role: {
      title: 'Senior Engineer',
      seniority: 'Senior',
      responsibilities: ['Build APIs'],
      technical_skills: ['TypeScript', 'Node.js'],
      domain_knowledge: ['Distributed Systems'],
      behavioural_expectations: ['Collaboration'],
      experience_requirements: ['5+ years'],
    },
    requirements: [
      { id: 'req_ts', text: 'TypeScript & Node.js proficiency', kind: 'technical', priority: 'must' },
      { id: 'req_team', text: 'Cross-functional team leadership', kind: 'behavioural', priority: 'must' },
    ],
    questions: [
      {
        id: 'q_tech_1',
        prompt: 'Explain the TypeScript event loop and microtask queue.',
        category: 'technical',
        requirement_ids: ['req_ts'],
        difficulty: 2,
        answer_outline: 'Outline for tech question 1',
        provenance: 'generated',
        edited: false,
        pinned: false,
      },
      {
        id: 'q_beh_1',
        prompt: 'Describe a situation where you resolved a team conflict.',
        category: 'behavioural',
        requirement_ids: ['req_team'],
        difficulty: 2,
        answer_outline: 'Outline for behavioural question 1',
        provenance: 'generated',
        edited: false,
        pinned: false,
      },
    ],
    flashcards: [
      {
        id: 'fc_1',
        front: 'What is TypeScript?',
        back: 'A typed superset of JavaScript.',
        requirement_ids: ['req_ts'],
        provenance: 'generated',
        edited: false,
        pinned: false,
      },
    ],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: 'TypeScript & Architecture', minutes: 45, question_ids: ['q_tech_1'] },
        { day: 2, focus: 'Team Leadership & Behavioural', minutes: 45, question_ids: ['q_beh_1'] },
      ],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 1,
    },
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: Editing a behavioural question survives technical-category regeneration
  // ──────────────────────────────────────────────────────────────────────────
  it('editing a behavioural question survives technical-category regeneration', async () => {
    const kit = await KitModel.create({
      userId: user._id,
      jobDescription: validJD,
      companyUrl: 'https://example.com',
      daysAvailable: 2,
      kitData: makeBaseKitData(),
      sections: {
        questions: { items: [], edited: false, pinned: false, version: 1, order: ['q_tech_1', 'q_beh_1'] },
        schedule: { items: [], edited: false, pinned: false, version: 1 },
      },
    });

    // 1. User edits behavioural question
    const updatedPrompt = 'CUSTOM EDIT: Tell me about leading a crisis response team under strict deadlines.';
    const editRes = await agent
      .patch(`/api/kits/${kit._id}/questions/q_beh_1`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .send({ prompt: updatedPrompt, answer_outline: 'Edited outline' })
      .expect(200);

    expect(editRes.body.question.prompt).toBe(updatedPrompt);
    expect(editRes.body.question.edited).toBe(true);

    // 2. Regenerate the TECHNICAL question category
    const regenRes = await agent
      .post(`/api/kits/${kit._id}/regenerate/questions/technical`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .expect(200);

    // 3. Verify behavioural question is 100% intact with user edits and stable ID
    const questions = regenRes.body.questions;
    const behQuestion = questions.find((q: any) => q.id === 'q_beh_1');
    expect(behQuestion).toBeDefined();
    expect(behQuestion.prompt).toBe(updatedPrompt);
    expect(behQuestion.answer_outline).toBe('Edited outline');
    expect(behQuestion.category).toBe('behavioural');
    expect(behQuestion.requirement_ids).toEqual(['req_team']);
    expect(behQuestion.edited).toBe(true);

    // Fresh technical question should have replaced the unedited technical question
    const techQuestions = questions.filter((q: any) => q.category === 'technical');
    expect(techQuestions.some((q: any) => q.prompt.includes('Mock freshly generated'))).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Editing a technical question survives technical-category regeneration
  // ──────────────────────────────────────────────────────────────────────────
  it('editing a technical question survives technical-category regeneration', async () => {
    const kit = await KitModel.create({
      userId: user._id,
      jobDescription: validJD,
      companyUrl: 'https://example.com',
      daysAvailable: 2,
      kitData: makeBaseKitData(),
      sections: {
        questions: { items: [], edited: false, pinned: false, version: 1, order: ['q_tech_1', 'q_beh_1'] },
        schedule: { items: [], edited: false, pinned: false, version: 1 },
      },
    });

    // 1. User edits the technical question
    const customTechPrompt = 'CUSTOM EDIT: Deep dive into V8 engine garbage collection and memory leaks.';
    const editRes = await agent
      .patch(`/api/kits/${kit._id}/questions/q_tech_1`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .send({ prompt: customTechPrompt })
      .expect(200);

    expect(editRes.body.question.prompt).toBe(customTechPrompt);
    expect(editRes.body.question.edited).toBe(true);

    // 2. Regenerate TECHNICAL questions
    const regenRes = await agent
      .post(`/api/kits/${kit._id}/regenerate/questions/technical`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .expect(200);

    // 3. Verify the user-edited technical question survived in its own category!
    const questions = regenRes.body.questions;
    const preservedTech = questions.find((q: any) => q.id === 'q_tech_1');
    expect(preservedTech).toBeDefined();
    expect(preservedTech.prompt).toBe(customTechPrompt);
    expect(preservedTech.edited).toBe(true);
    expect(preservedTech.category).toBe('technical');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: A hand-created question survives regeneration of its category
  // ──────────────────────────────────────────────────────────────────────────
  it('a hand-created question survives regeneration of its category', async () => {
    const kit = await KitModel.create({
      userId: user._id,
      jobDescription: validJD,
      companyUrl: 'https://example.com',
      daysAvailable: 2,
      kitData: makeBaseKitData(),
      sections: {
        questions: { items: [], edited: false, pinned: false, version: 1, order: ['q_tech_1', 'q_beh_1'] },
        schedule: { items: [], edited: false, pinned: false, version: 1 },
      },
    });

    // 1. User adds a manual question in technical category
    const manualPrompt = 'HAND-CREATED: How do you implement Distributed Tracing with OpenTelemetry?';
    const createRes = await agent
      .post(`/api/kits/${kit._id}/questions`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .send({
        prompt: manualPrompt,
        category: 'technical',
        difficulty: 3,
        requirement_ids: ['req_ts'],
        answer_outline: 'Trace context propagation, span creation, exporter configuration.',
      })
      .expect(201);

    const manualQId = createRes.body.question.id;
    expect(manualQId).toBeDefined();
    expect(createRes.body.question.provenance).toBe('user_created');

    // 2. Regenerate TECHNICAL questions
    const regenRes = await agent
      .post(`/api/kits/${kit._id}/regenerate/questions/technical`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .expect(200);

    // 3. Verify hand-created question survives
    const questions = regenRes.body.questions;
    const foundManual = questions.find((q: any) => q.id === manualQId);
    expect(foundManual).toBeDefined();
    expect(foundManual.prompt).toBe(manualPrompt);
    expect(foundManual.provenance).toBe('user_created');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: A pinned question survives regeneration
  // ──────────────────────────────────────────────────────────────────────────
  it('a pinned question survives regeneration', async () => {
    const kit = await KitModel.create({
      userId: user._id,
      jobDescription: validJD,
      companyUrl: 'https://example.com',
      daysAvailable: 2,
      kitData: makeBaseKitData(),
      sections: {
        questions: { items: [], edited: false, pinned: false, version: 1, order: ['q_tech_1', 'q_beh_1'] },
        schedule: { items: [], edited: false, pinned: false, version: 1 },
      },
    });

    // 1. Pin q_tech_1
    const pinRes = await agent
      .patch(`/api/kits/${kit._id}/questions/q_tech_1/pin`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .send({ pinned: true })
      .expect(200);

    expect(pinRes.body.question.pinned).toBe(true);

    // 2. Regenerate TECHNICAL category
    const regenRes = await agent
      .post(`/api/kits/${kit._id}/regenerate/questions/technical`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .expect(200);

    // 3. Verify pinned question is preserved with stable ID
    const questions = regenRes.body.questions;
    const preservedPinned = questions.find((q: any) => q.id === 'q_tech_1');
    expect(preservedPinned).toBeDefined();
    expect(preservedPinned.pinned).toBe(true);
    expect(preservedPinned.prompt).toBe('Explain the TypeScript event loop and microtask queue.');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 5: Reordering survives unrelated regeneration
  // ──────────────────────────────────────────────────────────────────────────
  it('reordering survives unrelated regeneration', async () => {
    const kit = await KitModel.create({
      userId: user._id,
      jobDescription: validJD,
      companyUrl: 'https://example.com',
      daysAvailable: 2,
      kitData: makeBaseKitData(),
      sections: {
        questions: { items: [], edited: false, pinned: false, version: 1, order: ['q_tech_1', 'q_beh_1'] },
        schedule: { items: [], edited: false, pinned: false, version: 1 },
      },
    });

    // 1. Invert question order: ['q_beh_1', 'q_tech_1']
    const customOrder = ['q_beh_1', 'q_tech_1'];
    await agent
      .post(`/api/kits/${kit._id}/questions/reorder`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .send({ order: customOrder })
      .expect(200);

    // 2. Regenerate Company Brief (unrelated section)
    await agent
      .post(`/api/kits/${kit._id}/regenerate/company-brief`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .expect(200);

    // 3. Verify order in DB is still ['q_beh_1', 'q_tech_1']
    const updatedDoc = await KitModel.findById(kit._id);
    expect(updatedDoc!.sections.questions.order).toEqual(customOrder);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 6: Company brief regeneration does not overwrite manual question edits
  // ──────────────────────────────────────────────────────────────────────────
  it('company brief regeneration does not overwrite manual question edits', async () => {
    const kit = await KitModel.create({
      userId: user._id,
      jobDescription: validJD,
      companyUrl: 'https://example.com',
      daysAvailable: 2,
      kitData: makeBaseKitData(),
      sections: {
        questions: { items: [], edited: false, pinned: false, version: 1, order: ['q_tech_1', 'q_beh_1'] },
        company_brief: { items: [], edited: false, pinned: false, version: 1 },
      },
    });

    // 1. Edit a question
    const customPrompt = 'User modified question prompt for system resilience';
    await agent
      .patch(`/api/kits/${kit._id}/questions/q_tech_1`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .send({ prompt: customPrompt })
      .expect(200);

    // 2. Regenerate Company Brief
    const regenRes = await agent
      .post(`/api/kits/${kit._id}/regenerate/company-brief`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .expect(200);

    expect(regenRes.body.company_brief.summary).toBe('Mock regenerated company brief');

    // 3. Verify question is completely untouched
    const freshDoc = await KitModel.findById(kit._id);
    const targetQ = freshDoc!.kitData.questions.find((q: any) => q.id === 'q_tech_1');
    expect(targetQ.prompt).toBe(customPrompt);
    expect(targetQ.edited).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 7: Schedule regeneration does not overwrite unrelated user edits
  // ──────────────────────────────────────────────────────────────────────────
  it('schedule regeneration does not overwrite unrelated user edits', async () => {
    const kit = await KitModel.create({
      userId: user._id,
      jobDescription: validJD,
      companyUrl: 'https://example.com',
      daysAvailable: 2,
      kitData: makeBaseKitData(),
      sections: {
        questions: { items: [], edited: false, pinned: false, version: 1, order: ['q_tech_1', 'q_beh_1'] },
        flashcards: { items: [], edited: false, pinned: false, version: 1 },
        schedule: { items: [], edited: false, pinned: false, version: 1 },
      },
    });

    // 1. Edit question and flashcard
    await agent
      .patch(`/api/kits/${kit._id}/questions/q_tech_1`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .send({ prompt: 'Custom question for schedule test' })
      .expect(200);

    await agent
      .patch(`/api/kits/${kit._id}/flashcards/fc_1`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .send({ front: 'Custom flashcard front' })
      .expect(200);

    // 2. Regenerate Schedule with 3 days
    const regenRes = await agent
      .post(`/api/kits/${kit._id}/regenerate/schedule`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .send({ daysAvailable: 3 })
      .expect(200);

    expect(regenRes.body.schedule.days_available).toBe(3);

    // 3. Verify questions and flashcards are intact
    const freshDoc = await KitModel.findById(kit._id);
    const q = freshDoc!.kitData.questions.find((q: any) => q.id === 'q_tech_1');
    const f = freshDoc!.kitData.flashcards.find((fc: any) => fc.id === 'fc_1');

    expect(q.prompt).toBe('Custom question for schedule test');
    expect(q.edited).toBe(true);
    expect(f.front).toBe('Custom flashcard front');
    expect(f.edited).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 8: Concurrent stale updates do not silently clobber work (409 Conflict)
  // ──────────────────────────────────────────────────────────────────────────
  it('concurrent stale updates do not silently clobber work', async () => {
    const kit = await KitModel.create({
      userId: user._id,
      jobDescription: validJD,
      companyUrl: 'https://example.com',
      daysAvailable: 2,
      kitData: makeBaseKitData(),
      version: 5,
    });

    // Client A and Client B both load the kit at version 5
    const initialVersion = 5;

    // Client A updates prompt successfully with version 5 -> server increments version to 6
    await agent
      .patch(`/api/kits/${kit._id}/questions/q_tech_1`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .send({ prompt: 'Client A edit', version: initialVersion })
      .expect(200);

    // Client B sends an update still specifying stale version 5 -> 409 Conflict!
    const conflictRes = await agent
      .patch(`/api/kits/${kit._id}/questions/q_tech_1`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .send({ prompt: 'Client B stale edit', version: initialVersion })
      .expect(409);

    expect(conflictRes.body.error).toContain('Conflict');
    expect(conflictRes.body.error).toContain('Stale kit version');

    // Confirm Client A's work was NOT overwritten
    const checkDoc = await KitModel.findById(kit._id);
    const q = checkDoc!.kitData.questions.find((q: any) => q.id === 'q_tech_1');
    expect(q.prompt).toBe('Client A edit');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 9: Safe removal of stale requirement references
  // ──────────────────────────────────────────────────────────────────────────
  it('safely removes stale requirement references when requirements are explicitly changed', async () => {
    const kit = await KitModel.create({
      userId: user._id,
      jobDescription: validJD,
      companyUrl: 'https://example.com',
      daysAvailable: 2,
      kitData: makeBaseKitData(),
      sections: {
        requirements: { items: [], edited: false, pinned: false, version: 1 },
      },
    });

    // Currently q_tech_1 points to 'req_ts' and q_beh_1 points to 'req_team'
    // Update requirements to only have 'req_ts_v2' and 'req_team' (removing 'req_ts')
    const updatedRequirements = [
      { id: 'req_ts_v2', text: 'Modern TypeScript', kind: 'technical', priority: 'must' },
      { id: 'req_team', text: 'Team leadership', kind: 'behavioural', priority: 'must' },
    ];

    await agent
      .patch(`/api/kits/${kit._id}/sections/requirements`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .send({ items: updatedRequirements })
      .expect(200);

    const checkDoc = await KitModel.findById(kit._id);
    const q1 = checkDoc!.kitData.questions.find((q: any) => q.id === 'q_tech_1');
    const fc1 = checkDoc!.kitData.flashcards.find((f: any) => f.id === 'fc_1');

    // 'req_ts' was deleted, so references should safely fall back to valid requirements
    expect(q1.requirement_ids).not.toContain('req_ts');
    expect(q1.requirement_ids.length).toBeGreaterThan(0);
    expect(fc1.requirement_ids).not.toContain('req_ts');

    // Integrity check
    const validation = validateKitReferences(checkDoc!.kitData);
    expect(validation.valid).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 10: Schedule references are updated when questions are deleted
  // ──────────────────────────────────────────────────────────────────────────
  it('updates schedule references when questions are deleted', async () => {
    const kit = await KitModel.create({
      userId: user._id,
      jobDescription: validJD,
      companyUrl: 'https://example.com',
      daysAvailable: 2,
      kitData: makeBaseKitData(),
      sections: {
        questions: { items: [], edited: false, pinned: false, version: 1, order: ['q_tech_1', 'q_beh_1'] },
        schedule: { items: [], edited: false, pinned: false, version: 1 },
      },
    });

    // Delete q_tech_1
    await agent
      .delete(`/api/kits/${kit._id}/questions/q_tech_1`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .expect(200);

    const checkDoc = await KitModel.findById(kit._id);
    const scheduledIds = checkDoc!.kitData.schedule.days.flatMap((d: any) => d.question_ids);

    expect(scheduledIds).not.toContain('q_tech_1');
    expect(scheduledIds).toContain('q_beh_1');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 11: Company brief and schedule fields can be edited directly
  // ──────────────────────────────────────────────────────────────────────────
  it('allows direct edits to company brief and schedule day fields', async () => {
    const kit = await KitModel.create({
      userId: user._id,
      jobDescription: validJD,
      companyUrl: 'https://example.com',
      daysAvailable: 2,
      kitData: makeBaseKitData(),
      sections: {
        company_brief: { items: [], edited: false, pinned: false, version: 1 },
        schedule: { items: [], edited: false, pinned: false, version: 1 },
      },
    });

    // 1. Edit company brief
    const briefRes = await agent
      .patch(`/api/kits/${kit._id}/company-brief`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .send({ summary: 'User refined company brief summary.' })
      .expect(200);

    expect(briefRes.body.company_brief.summary).toBe('User refined company brief summary.');

    // 2. Edit schedule day 1
    const dayRes = await agent
      .patch(`/api/kits/${kit._id}/schedule/days/1`)
      .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
      .send({ focus: 'Deep Dive into Distributed Queues', minutes: 60 })
      .expect(200);

    expect(dayRes.body.day.focus).toBe('Deep Dive into Distributed Queues');
    expect(dayRes.body.day.minutes).toBe(60);
  });
});
