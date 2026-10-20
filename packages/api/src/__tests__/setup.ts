import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase } from '../db';

const TEST_MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/interview-prep-test';

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  process.env.SESSION_SECRET = 'test-session-secret-key-for-testing-only';
  process.env.NODE_ENV = 'test';
  process.env.CSRF_ENABLED = 'false';
  process.env.SESSION_COOKIE_SECURE = 'false';
  
  // Set the test URI
  process.env.MONGODB_URI = TEST_MONGODB_URI;
  
  // Connect using the app's connectDatabase function
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