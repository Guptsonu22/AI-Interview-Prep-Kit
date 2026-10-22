import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

// Set test-only values before importing the database/config modules. Never use
// a developer's .env database for tests that clear collections between cases.
const TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017/interview-prep-test';
process.env.MONGODB_URI = TEST_MONGODB_URI;
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.SESSION_SECRET = 'test-session-secret-key-for-testing-only';
process.env.NODE_ENV = 'test';
process.env.CSRF_ENABLED = 'false';
process.env.SESSION_COOKIE_SECURE = 'false';

beforeAll(async () => {
  const { connectDatabase } = await import('../db');
  await connectDatabase();
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});
