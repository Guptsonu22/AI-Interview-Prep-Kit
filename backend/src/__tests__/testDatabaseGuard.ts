export function assertIsolatedTestDatabase(uri: string, connectedDatabaseName?: string): void {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('Refusing destructive test setup: MONGODB_URI is not a valid MongoDB URL');
  }

  const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]';
  const isTestDatabase = parsed.pathname.replace(/^\//, '') === 'interview-prep-test';
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) || !isLoopback || !isTestDatabase || parsed.username || parsed.password) {
    throw new Error('Refusing destructive test setup: tests require the local interview-prep-test database without credentials');
  }
  if (connectedDatabaseName !== undefined && connectedDatabaseName !== 'interview-prep-test') {
    throw new Error(`Refusing destructive test setup: connected to unexpected database "${connectedDatabaseName}"`);
  }
}
