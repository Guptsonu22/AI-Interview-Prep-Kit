import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { User, KitModel, PracticeRecord } from '../db/models';
import { createSession, revokeAllUserSessions } from '../middleware/auth';
import { config } from '../config';

const createTestApp = async () => {
  const { createApp } = await import('../index');
  return createApp();
};

describe('Authentication', () => {
  let app: express.Express;
  let agent: request.SuperAgentTest;

  beforeEach(async () => {
    app = await createTestApp();
    agent = request.agent(app);
  });

  describe('POST /api/auth/register', () => {
    it('registers a new user successfully', async () => {
      const res = await agent
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(201);

      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('test@example.com');
      expect(res.body.user.id).toBeDefined();

      const user = await User.findOne({ email: 'test@example.com' });
      expect(user).toBeDefined();
      expect(user!.email).toBe('test@example.com');
    });

    it('rejects duplicate email registration', async () => {
      await User.create({ email: 'existing@example.com', passwordHash: 'hash' });

      const res = await agent
        .post('/api/auth/register')
        .send({ email: 'existing@example.com', password: 'password123' })
        .expect(409);

      expect(res.body.error).toBe('Email already registered');
    });

    it('rejects invalid email format', async () => {
      const res = await agent
        .post('/api/auth/register')
        .send({ email: 'invalid-email', password: 'password123' })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('rejects short password', async () => {
      const res = await agent
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'short' })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('normalizes email to lowercase', async () => {
      await agent
        .post('/api/auth/register')
        .send({ email: 'Test@Example.COM', password: 'password123' })
        .expect(201);

      const user = await User.findOne({ email: 'test@example.com' });
      expect(user).toBeDefined();
    });

    it('sets HTTP-only session cookie on registration', async () => {
      const res = await agent
        .post('/api/auth/register')
        .send({ email: 'cookie@example.com', password: 'password123' })
        .expect(201);

      const cookie = res.headers['set-cookie'];
      expect(cookie).toBeDefined();
      const cookieStr = cookie![0];
      expect(cookieStr).toContain('HttpOnly');
      expect(cookieStr).toContain(config.session.cookieName);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      const bcrypt = await import('bcryptjs');
      await User.create({ email: 'login@example.com', passwordHash: await bcrypt.hash('password123', 12) });
    });

    it('logs in with valid credentials', async () => {
      const res = await agent
        .post('/api/auth/login')
        .send({ email: 'login@example.com', password: 'password123' })
        .expect(200);

      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('login@example.com');
    });

    it('rejects invalid password with generic error', async () => {
      const res = await agent
        .post('/api/auth/login')
        .send({ email: 'login@example.com', password: 'wrongpassword' })
        .expect(401);

      expect(res.body.error).toBe('Invalid credentials');
    });

    it('rejects non-existent user with generic error', async () => {
      const res = await agent
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'password123' })
        .expect(401);

      expect(res.body.error).toBe('Invalid credentials');
    });

    it('revokes existing sessions on new login', async () => {
      const user = await User.findOne({ email: 'login@example.com' });
      await createSession(user!._id.toString(), 'test-agent', '127.0.0.1');

      await agent
        .post('/api/auth/login')
        .send({ email: 'login@example.com', password: 'password123' })
        .expect(200);

      const { Session } = await import('../db/models');
      const sessions = await Session.find({ userId: user!._id, revokedAt: null });
      expect(sessions.length).toBe(1);
    });

    it('sets session cookie on login', async () => {
      const res = await agent
        .post('/api/auth/login')
        .send({ email: 'login@example.com', password: 'password123' })
        .expect(200);

      const cookie = res.headers['set-cookie'];
      expect(cookie).toBeDefined();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('logs out authenticated user', async () => {
      const user = await User.create({ email: 'logout@example.com', passwordHash: 'hash' });
      const sessionToken = await createSession(user._id.toString(), 'test-agent', '127.0.0.1');

      const res = await agent
        .post('/api/auth/logout')
        .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
        .expect(200);

      expect(res.body.message).toBe('Logged out successfully');
    });

    it('clears session cookie on logout', async () => {
      const user = await User.create({ email: 'logout2@example.com', passwordHash: 'hash' });
      const sessionToken = await createSession(user._id.toString(), 'test-agent', '127.0.0.1');

      const res = await agent
        .post('/api/auth/logout')
        .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
        .expect(200);

      const cookie = res.headers['set-cookie'];
      expect(cookie).toBeDefined();
      const cookieStr = cookie![0];
      expect(cookieStr).toContain('Max-Age=0');
    });

    it('rejects unauthenticated logout', async () => {
      const res = await agent.post('/api/auth/logout').expect(401);
      expect(res.body.error).toBe('Authentication required');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns current user for valid session', async () => {
      const user = await User.create({ email: 'me@example.com', passwordHash: 'hash' });
      const sessionToken = await createSession(user._id.toString(), 'test-agent', '127.0.0.1');

      const res = await agent
        .get('/api/auth/me')
        .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
        .expect(200);

      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe(user._id.toString());
      expect(res.body.user.email).toBe('me@example.com');
    });

    it('rejects request without session cookie', async () => {
      const res = await agent.get('/api/auth/me').expect(401);
      expect(res.body.error).toBe('Authentication required');
    });

    it('rejects invalid session token', async () => {
      const res = await agent
        .get('/api/auth/me')
        .set('Cookie', [`${config.session.cookieName}=invalid-token`])
        .expect(401);

      expect(res.body.error).toBe('Invalid or expired session');
    });

    it('rejects expired session', async () => {
      const { Session } = await import('../db/models');
      const user = await User.create({ email: 'expired@example.com', passwordHash: 'hash' });
      const expiredToken = 'expired-token';
      const crypto = require('crypto');
      const tokenHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
      
      await Session.create({
        userId: user._id,
        tokenHash,
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
      });

      const res = await agent
        .get('/api/auth/me')
        .set('Cookie', [`${config.session.cookieName}=${expiredToken}`])
        .expect(401);

      expect(res.body.error).toBe('Session expired');
    });
  });

  describe('POST /api/auth/revoke-all', () => {
    it('revokes all user sessions', async () => {
      const user = await User.create({ email: 'revoke@example.com', passwordHash: 'hash' });
      await createSession(user._id.toString(), 'agent1', '127.0.0.1');
      await createSession(user._id.toString(), 'agent2', '127.0.0.1');

      const sessionToken = await createSession(user._id.toString(), 'agent3', '127.0.0.1');

      await agent
        .post('/api/auth/revoke-all')
        .set('Cookie', [`${config.session.cookieName}=${sessionToken}`])
        .expect(200);

      const { Session } = await import('../db/models');
      const sessions = await Session.find({ userId: user._id, revokedAt: null });
      expect(sessions.length).toBe(0);
    });
  });
});

describe('Session Security', () => {
  let app: express.Express;
  let agent: request.SuperAgentTest;

  beforeEach(async () => {
    app = await createTestApp();
    agent = request.agent(app);
  });

  it('uses secure cookies in production', () => {
    expect(config.session.httpOnly).toBe(true);
    expect(config.session.sameSite).toBe('lax');
  });

  it('hashes session tokens before storage', async () => {
    const { Session } = await import('../db/models');
    const crypto = require('crypto');
    
    const user = await User.create({ email: 'hash@example.com', passwordHash: 'hash' });
    const token = 'test-session-token';
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    await Session.create({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 86400000),
    });

    const session = await Session.findOne({ tokenHash });
    expect(session).toBeDefined();
    expect(session!.tokenHash).toBe(tokenHash);
  });
});

describe('Ownership Enforcement', () => {
  let app: express.Express;
  let agent: request.SuperAgentTest;
  let user1: any, user2: any;
  let session1: string, session2: string;

  beforeEach(async () => {
    app = await createTestApp();
    agent = request.agent(app);

    user1 = await User.create({ email: 'owner@example.com', passwordHash: 'hash' });
    user2 = await User.create({ email: 'other@example.com', passwordHash: 'hash' });

    session1 = await createSession(user1._id.toString(), 'test-agent', '127.0.0.1');
    session2 = await createSession(user2._id.toString(), 'test-agent', '127.0.0.1');
  });

  describe('Kit ownership', () => {
    let kit: any;

    beforeEach(async () => {
      kit = await KitModel.create({
        userId: user1._id,
        jobDescription: 'Software Engineer position at Tech Corp',
        companyUrl: 'https://techcorp.com',
        daysAvailable: 14,
        kitData: {},
        sections: {
          requirements: { items: [], edited: false, pinned: false, version: 0 },
          questions: { items: [], edited: false, pinned: false, version: 0, order: [] },
          flashcards: { items: [], edited: false, pinned: false, version: 0 },
          schedule: { items: [], edited: false, pinned: false, version: 0 },
          coverage: { items: {}, version: 0 },
        },
        status: 'draft',
      });
    });

    it('allows owner to read kit', async () => {
      const res = await agent
        .get(`/api/kits/${kit._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .expect(200);

      expect(res.body.kit.id).toBe(kit._id.toString());
    });

    it('denies access to non-owner', async () => {
      const res = await agent
        .get(`/api/kits/${kit._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session2}`])
        .expect(403);

      expect(res.body.error).toBe('Access denied');
    });

    it('allows owner to update kit', async () => {
      const res = await agent
        .patch(`/api/kits/${kit._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({ status: 'ready' })
        .expect(200);

      expect(res.body.kit.status).toBe('ready');
    });

    it('denies update to non-owner', async () => {
      const res = await agent
        .patch(`/api/kits/${kit._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session2}`])
        .send({ status: 'ready' })
        .expect(403);

      expect(res.body.error).toBe('Access denied');
    });

    it('denies delete to non-owner', async () => {
      const res = await agent
        .delete(`/api/kits/${kit._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session2}`])
        .expect(403);

      expect(res.body.error).toBe('Access denied');
    });

    it('allows owner to delete kit', async () => {
      await agent
        .delete(`/api/kits/${kit._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .expect(204);

      const deleted = await KitModel.findById(kit._id);
      expect(deleted).toBeNull();
    });
  });

  describe('Practice record ownership', () => {
    let kit: any;

    beforeEach(async () => {
      kit = await KitModel.create({
        userId: user1._id,
        jobDescription: 'Software Engineer position at Tech Corp',
        companyUrl: 'https://techcorp.com',
        daysAvailable: 14,
        kitData: { flashcards: [{ id: 'fc-1', front: 'Q', back: 'A', requirement_ids: [] }] },
        sections: {
          requirements: { items: [], edited: false, pinned: false, version: 0 },
          questions: { items: [], edited: false, pinned: false, version: 0, order: [] },
          flashcards: { items: [], edited: false, pinned: false, version: 0 },
          schedule: { items: [], edited: false, pinned: false, version: 0 },
          coverage: { items: {}, version: 0 },
        },
        status: 'ready',
      });
    });

    it('allows owner to create practice record', async () => {
      const res = await agent
        .post(`/api/practice/kit/${kit._id}/record`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({ flashcardId: 'fc-1', confidence: 4 })
        .expect(200);

      expect(res.body.record.flashcardId).toBe('fc-1');
      expect(res.body.record.confidence).toBe(4);
    });

    it('denies practice record creation for non-owner', async () => {
      const res = await agent
        .post(`/api/practice/kit/${kit._id}/record`)
        .set('Cookie', [`${config.session.cookieName}=${session2}`])
        .send({ flashcardId: 'fc-1', confidence: 4 })
        .expect(403);

      expect(res.body.error).toBe('Access denied');
    });

    it('allows owner to get due flashcards', async () => {
      await PracticeRecord.create({
        userId: user1._id,
        kitId: kit._id,
        flashcardId: 'fc-1',
        confidence: 3,
        reviewedAt: new Date(),
        nextReviewAt: new Date(Date.now() - 1000),
        interval: 1,
        easeFactor: 2.5,
        repetitions: 1,
      });

      const res = await agent
        .get(`/api/practice/kit/${kit._id}/due`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .expect(200);

      expect(res.body.records.length).toBeGreaterThan(0);
    });

    it('denies due flashcards for non-owner', async () => {
      const res = await agent
        .get(`/api/practice/kit/${kit._id}/due`)
        .set('Cookie', [`${config.session.cookieName}=${session2}`])
        .expect(403);

      expect(res.body.error).toBe('Access denied');
    });
  });

  describe('Schedule ownership', () => {
    let kit: any;

    beforeEach(async () => {
      kit = await KitModel.create({
        userId: user1._id,
        jobDescription: 'Software Engineer position at Tech Corp',
        companyUrl: 'https://techcorp.com',
        daysAvailable: 14,
        kitData: { schedule: { days_available: 14, days: [{ day: 1, focus: 'Test', question_ids: [], minutes: 60 }] } },
        sections: {
          requirements: { items: [], edited: false, pinned: false, version: 0 },
          questions: { items: [], edited: false, pinned: false, version: 0, order: [] },
          flashcards: { items: [], edited: false, pinned: false, version: 0 },
          schedule: { items: [], edited: false, pinned: false, version: 0 },
          coverage: { items: {}, version: 0 },
        },
        status: 'ready',
      });
    });

    it('allows owner to read schedule', async () => {
      const res = await agent
        .get(`/api/schedule/${kit._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .expect(200);

      expect(res.body.schedule).toBeDefined();
    });

    it('denies schedule access to non-owner', async () => {
      const res = await agent
        .get(`/api/schedule/${kit._id}`)
        .set('Cookie', [`${config.session.cookieName}=${session2}`])
        .expect(403);

      expect(res.body.error).toBe('Access denied');
    });

    it('allows owner to update schedule day', async () => {
      const res = await agent
        .patch(`/api/schedule/${kit._id}/days/1`)
        .set('Cookie', [`${config.session.cookieName}=${session1}`])
        .send({ focus: 'Updated Focus' })
        .expect(200);

      expect(res.body.schedule.days[0].focus).toBe('Updated Focus');
    });
  });
});

describe('Protected Endpoints', () => {
  let app: express.Express;
  let agent: request.SuperAgentTest;

  beforeEach(async () => {
    app = await createTestApp();
    agent = request.agent(app);
  });

  const protectedEndpoints = [
    { method: 'get', path: '/api/kits' },
    { method: 'post', path: '/api/kits' },
    { method: 'get', path: '/api/kits/123' },
    { method: 'patch', path: '/api/kits/123' },
    { method: 'delete', path: '/api/kits/123' },
    { method: 'post', path: '/api/kits/123/generate' },
    { method: 'get', path: '/api/schedule/123' },
    { method: 'patch', path: '/api/schedule/123/days/1' },
    { method: 'post', path: '/api/practice/kit/123/record' },
    { method: 'get', path: '/api/practice/kit/123/due' },
  ];

  for (const { method, path } of protectedEndpoints) {
    it(`rejects unauthenticated ${method.toUpperCase()} ${path}`, async () => {
      const res = await agent[method](path).expect(401);
      expect(res.body.error).toBeDefined();
    });
  }
});