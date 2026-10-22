import { describe, expect, it } from 'vitest';
import { assertIsolatedTestDatabase } from './testDatabaseGuard';

describe('test database safety guard', () => {
  it('allows only the local isolated test database', () => {
    expect(() => assertIsolatedTestDatabase('mongodb://127.0.0.1:27017/interview-prep-test', 'interview-prep-test')).not.toThrow();
  });

  it('refuses the normal development database', () => {
    expect(() => assertIsolatedTestDatabase('mongodb://localhost:27017/interview-prep')).toThrow(/Refusing destructive test setup/);
  });

  it('refuses an unexpected connected database name', () => {
    expect(() => assertIsolatedTestDatabase('mongodb://127.0.0.1:27017/interview-prep-test', 'interview-prep')).toThrow(/unexpected database/);
  });
});
