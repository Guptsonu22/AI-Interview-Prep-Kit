import { Request, Response, NextFunction } from 'express';
import { KitModel } from '../db/models';
import { AuthRequest } from '../middleware/auth';
import pino from 'pino';

const logger = pino({ name: 'ownership-middleware' });

/**
 * Ensures the authenticated user owns the requested kit.
 * Checks `paramName`, falling back to `id` or `kitId`.
 * Attaches the full Mongoose kit document to `(req as any).kit`.
 */
export function requireKitOwnership(paramName?: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kitId = (paramName ? req.params[paramName] : null) || req.params['id'] || req.params['kitId'];
      if (!kitId) {
        res.status(400).json({ error: 'Missing kit ID parameter' });
        return;
      }

      const kit = await KitModel.findById(kitId);
      if (!kit) {
        res.status(404).json({ error: 'Kit not found' });
        return;
      }

      if (kit.userId.toString() !== req.user!.id) {
        logger.warn({ userId: req.user!.id, kitId, ownerId: kit.userId.toString() }, 'Ownership violation');
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      (req as any).kit = kit;
      next();
    } catch (error) {
      logger.error({ err: error }, 'Ownership check error');
      res.status(500).json({ error: 'Authorization error' });
    }
  };
}

/**
 * Checks kit ownership for practice routes.
 */
export function requirePracticeOwnership(paramName = 'kitId') {
  return requireKitOwnership(paramName);
}

/**
 * Attaches the kit document to req.kit if owned, without blocking if not found.
 */
export function attachKitIfOwned(paramName?: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kitId = (paramName ? req.params[paramName] : null) || req.params['id'] || req.params['kitId'];
      if (!kitId) {
        return next();
      }

      const kit = await KitModel.findById(kitId);
      if (kit && kit.userId.toString() === req.user!.id) {
        (req as any).kit = kit;
      }
      next();
    } catch (error) {
      logger.error({ err: error }, 'Attach kit error');
      next();
    }
  };
}