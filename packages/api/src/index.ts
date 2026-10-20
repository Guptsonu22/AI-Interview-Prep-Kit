import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import csrf from 'csurf';
import pino from 'pino';
import { config } from './config';
import { connectDatabase, disconnectDatabase, getMongooseConnection } from './db';
import { authRouter } from './modules/auth/routes';
import { kitsRouter } from './modules/kits/routes';
import { flashcardsRouter } from './modules/flashcards/routes';
import { scheduleRouter } from './modules/schedule/routes';
import { practiceRouter } from './modules/practice/routes';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { csrfMiddleware } from './middleware/csrf';

const logger = pino({ name: 'api' });

async function createApp(): Promise<express.Express> {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: config.nodeEnv === 'production',
    crossOriginEmbedderPolicy: false,
  }));
  
  app.use(cors({
    origin: config.cors.origin,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', config.csrf.headerName],
  }));
  
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser(config.session.secret));

  const mongooseConnection = getMongooseConnection();
  if (mongooseConnection) {
    app.use(session({
      name: config.session.cookieName,
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        client: mongooseConnection.getClient(),
        dbName: mongooseConnection.db?.databaseName,
        collectionName: 'sessions',
        ttl: Math.floor(config.session.maxAge / 1000),
        autoRemove: 'native',
      }),
      cookie: {
        httpOnly: config.session.httpOnly,
        secure: config.session.secure,
        sameSite: config.session.sameSite,
        maxAge: config.session.maxAge,
        path: config.session.path,
        domain: config.session.domain || undefined,
      },
      rolling: true,
    }));
  }

  if (config.csrf.enabled) {
    const csrfProtection = csrf({
      cookie: {
        key: config.csrf.cookieName,
        httpOnly: true,
        secure: config.session.secure,
        sameSite: config.session.sameSite,
        path: config.session.path,
        domain: config.session.domain || undefined,
      },
    });
    app.use(csrfProtection);
    app.use(csrfMiddleware);
  }

  app.use((req, _res, next) => {
    logger.info({ method: req.method, path: req.path }, 'request');
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  if (config.csrf.enabled) {
    app.get('/api/csrf-token', (req, res) => {
      res.json({ csrfToken: (req as any).csrfToken() });
    });
  }

  app.use('/api/auth', authRouter);
  app.use('/api/kits', authMiddleware, kitsRouter);
  app.use('/api/flashcards', authMiddleware, flashcardsRouter);
  app.use('/api/schedule', authMiddleware, scheduleRouter);
  app.use('/api/practice', authMiddleware, practiceRouter);

  app.use(errorHandler);

  return app;
}

async function start(): Promise<void> {
  validateConfig();
  await connectDatabase();

  const app = await createApp();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'API server started');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

function validateConfig(): void {
  if (!config.jwt.secret || config.jwt.secret === 'dev-secret-change-in-production') {
    if (config.nodeEnv === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }
    logger.warn('Using default JWT_SECRET - not safe for production');
  }
  if (!config.session.secret || config.session.secret === 'dev-session-secret-change-in-production') {
    if (config.nodeEnv === 'production') {
      throw new Error('SESSION_SECRET must be set in production');
    }
    logger.warn('Using default SESSION_SECRET - not safe for production');
  }
  if (!config.mongodb.uri) {
    throw new Error('MONGODB_URI is required');
  }
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});