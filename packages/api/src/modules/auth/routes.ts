import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../../db/models';
import { config } from '../../config';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { authMiddleware, createSession, revokeSession, revokeAllUserSessions } from '../../middleware/auth';
import { AuthRequest } from '../../middleware/auth';
import pino from 'pino';

const logger = pino({ name: 'auth-routes' });
const router = Router();

const registerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

router.post('/register', asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);

  const existing = await User.findOne({ email: data.email });
  if (existing) {
    throw new AppError(409, 'Email already registered');
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await User.create({ email: data.email, passwordHash });

  const sessionToken = await createSession(
    user._id.toString(),
    (req.headers['user-agent'] as string) || null,
    req.ip || null
  );

  res.cookie(config.session.cookieName, sessionToken, {
    httpOnly: config.session.httpOnly,
    secure: config.session.secure,
    sameSite: config.session.sameSite,
    maxAge: config.session.maxAge,
    path: config.session.path,
    domain: config.session.domain || undefined,
  });

  logger.info({ userId: user._id.toString() }, 'User registered');

  res.status(201).json({
    user: { id: user._id.toString(), email: user.email },
  });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);

  const user = await User.findOne({ email: data.email });
  if (!user) {
    logger.warn({ email: data.email }, 'Login attempt with non-existent email');
    throw new AppError(401, 'Invalid credentials');
  }

  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) {
    logger.warn({ userId: user._id.toString() }, 'Login attempt with invalid password');
    throw new AppError(401, 'Invalid credentials');
  }

  await revokeAllUserSessions(user._id.toString());

  const sessionToken = await createSession(
    user._id.toString(),
    (req.headers['user-agent'] as string) || null,
    req.ip || null
  );

  res.cookie(config.session.cookieName, sessionToken, {
    httpOnly: config.session.httpOnly,
    secure: config.session.secure,
    sameSite: config.session.sameSite,
    maxAge: config.session.maxAge,
    path: config.session.path,
    domain: config.session.domain || undefined,
  });

  logger.info({ userId: user._id.toString() }, 'User logged in');

  res.json({
    user: { id: user._id.toString(), email: user.email },
  });
}));

router.post('/logout', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  if (req.sessionId) {
    await revokeSession(req.sessionId);
  }

  res.clearCookie(config.session.cookieName, {
    httpOnly: config.session.httpOnly,
    secure: config.session.secure,
    sameSite: config.session.sameSite,
    path: config.session.path,
    domain: config.session.domain || undefined,
    maxAge: 0,
  });

  logger.info({ userId: req.user?.id }, 'User logged out');

  res.json({ message: 'Logged out successfully' });
}));

router.get('/me', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  res.json({ user: { id: req.user!.id, email: req.user!.email } });
}));

router.post('/revoke-all', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  await revokeAllUserSessions(req.user!.id);
  
  res.clearCookie(config.session.cookieName, {
    httpOnly: config.session.httpOnly,
    secure: config.session.secure,
    sameSite: config.session.sameSite,
    path: config.session.path,
    domain: config.session.domain || undefined,
    maxAge: 0,
  });

  logger.info({ userId: req.user!.id }, 'All sessions revoked');

  res.json({ message: 'All sessions revoked' });
}));

export { router as authRouter };