import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import pino from 'pino';

const logger = pino({ name: 'csrf-middleware' });

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.csrf.enabled) {
    return next();
  }

  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  const csrfToken = req.cookies?.[config.csrf.cookieName];
  const headerToken = req.headers[config.csrf.headerName.toLowerCase()] as string | undefined;

  if (!csrfToken || !headerToken || csrfToken !== headerToken) {
    logger.warn({ path: req.path, method: req.method }, 'CSRF validation failed');
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next();
}

export function getCsrfToken(req: Request): string | undefined {
  return req.cookies?.[config.csrf.cookieName];
}