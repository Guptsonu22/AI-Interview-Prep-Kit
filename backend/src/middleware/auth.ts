import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { User, Session } from '../db/models';
import pino from 'pino';
import crypto from 'crypto';
import mongoose from 'mongoose';

const logger = pino({ name: 'auth-middleware' });

export interface AuthRequest extends Request {
  user?: { id: string; email: string };
  sessionId?: string;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionId = req.cookies?.[config.session.cookieName];
    
    if (!sessionId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const tokenHash = hashToken(sessionId);
    const session = await Session.findOne({ tokenHash, revokedAt: null });
    
    if (!session) {
      res.clearCookie(config.session.cookieName, {
        httpOnly: config.session.httpOnly,
        secure: config.session.secure,
        sameSite: config.session.sameSite,
        path: config.session.path,
        domain: config.session.domain || undefined,
      });
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    if (session.expiresAt < new Date()) {
      await Session.findByIdAndDelete(session._id);
      res.clearCookie(config.session.cookieName, {
        httpOnly: config.session.httpOnly,
        secure: config.session.secure,
        sameSite: config.session.sameSite,
        path: config.session.path,
        domain: config.session.domain || undefined,
      });
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    const user = await User.findById(session.userId).select('_id email').lean();
    if (!user) {
      await Session.findByIdAndDelete(session._id);
      res.clearCookie(config.session.cookieName, {
        httpOnly: config.session.httpOnly,
        secure: config.session.secure,
        sameSite: config.session.sameSite,
        path: config.session.path,
        domain: config.session.domain || undefined,
      });
      res.status(401).json({ error: 'User not found' });
      return;
    }

    req.user = { id: user._id.toString(), email: user.email };
    req.sessionId = session._id.toString();
    next();
  } catch (error) {
    logger.error({ err: error }, 'Auth middleware error');
    res.status(500).json({ error: 'Authentication error' });
  }
}

export async function createSession(
  userId: string,
  userAgent: string | null,
  ip: string | null
): Promise<string> {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + config.session.maxAge);

  await Session.create({
    userId: new mongoose.Types.ObjectId(userId),
    tokenHash,
    userAgent,
    ip,
    expiresAt,
  });

  return sessionToken;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await Session.findByIdAndUpdate(sessionId, { revokedAt: new Date() });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await Session.updateMany(
    { userId: new mongoose.Types.ObjectId(userId), revokedAt: null },
    { revokedAt: new Date() }
  );
}