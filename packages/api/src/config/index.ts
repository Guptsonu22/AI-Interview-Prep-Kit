import dotenv from 'dotenv';
dotenv.config();

function getEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
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
  },
};

export function validateConfig(): void {
  const required = [
    { key: 'MONGODB_URI', value: config.mongodb.uri },
    { key: 'JWT_SECRET', value: config.jwt.secret },
  ];

  const missing = required.filter((r) => !r.value || r.value.includes('dev-secret'));
  if (missing.length > 0 && config.nodeEnv === 'production') {
    throw new Error(`Missing required env vars: ${missing.map((m) => m.key).join(', ')}`);
  }
}