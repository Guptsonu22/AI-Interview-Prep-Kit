import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { User } from '../db/models';
import pino from 'pino';

const logger = pino({ name: 'auth-middleware' });

export interface AuthRequest extends Request {
  user?: { id: string; email: string };
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, config.jwt.secret) as { userId: string; email: string };

    const user = await User.findById(decoded.userId).select('_id email').lean();
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    req.user = { id: user._id.toString(), email: user.email };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    logger.error({ err: error }, 'Auth middleware error');
    res.status(500).json({ error: 'Authentication error' });
  }
}