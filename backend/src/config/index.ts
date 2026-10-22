import dotenv from 'dotenv';
dotenv.config();

function getEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function getEnvBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val === 'true' || val === '1';
}

export const config = {
  port: parseInt(getEnv('PORT', '4000'), 10),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  mongodb: {
    uri: getEnv('MONGODB_URI', 'mongodb://localhost:27017/interview-prep'),
  },
  jwt: {
    secret: getEnv('JWT_SECRET', 'dev-secret-change-in-production'),
    expiresIn: getEnv('JWT_EXPIRES_IN', '7d'),
  },
  session: {
    secret: getEnv('SESSION_SECRET', 'dev-session-secret-change-in-production'),
    cookieName: 'sid',
    maxAge: 1000 * 60 * 60 * 24 * 30,
    secure: getEnvBool('SESSION_COOKIE_SECURE', false),
    sameSite: getEnv('SESSION_COOKIE_SAMESITE', 'lax') as 'lax' | 'strict' | 'none',
    httpOnly: true,
    path: '/',
    domain: getEnv('SESSION_COOKIE_DOMAIN', ''),
  },
  csrf: {
    get enabled() {
      if (process.env['NODE_ENV'] === 'test') return false;
      return getEnvBool('CSRF_ENABLED', true);
    },
    cookieName: 'csrf_token',
    headerName: 'x-csrf-token',
  },
  llm: {
    apiKey: getEnv('LLM_API_KEY', ''),
    baseUrl: getEnv('LLM_BASE_URL', 'https://api.openai.com/v1'),
    model: getEnv('LLM_MODEL', 'gpt-4o-mini'),
    temperature: parseFloat(getEnv('LLM_TEMPERATURE', '0')),
  },
  search: {
    apiKey: getEnv('SEARCH_API_KEY', ''),
    engine: getEnv('SEARCH_ENGINE', 'serpapi'),
  },
  cors: {
    origin: getEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
    credentials: true,
  },
};

export function validateConfig(): void {
  const required = [
    { key: 'MONGODB_URI', value: config.mongodb.uri },
    { key: 'JWT_SECRET', value: config.jwt.secret },
    { key: 'SESSION_SECRET', value: config.session.secret },
  ];

  const missing = required.filter((r) => !r.value || r.value.includes('dev-secret'));
  if (missing.length > 0 && config.nodeEnv === 'production') {
    throw new Error(`Missing required env vars: ${missing.map((m) => m.key).join(', ')}`);
  }
}