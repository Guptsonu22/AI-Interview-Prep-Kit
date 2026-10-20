import { Request, Response, NextFunction } from 'express';
import { KitModel, PracticeRecord } from '../db/models';
import { AuthRequest } from '../middleware/auth';
import pino from 'pino';

const logger = pino({ name: 'ownership-middleware' });

export function requireKitOwnership(paramName = 'kitId') {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kitId = req.params[paramName];
      if (!kitId) {
        res.status(400).json({ error: `Missing ${paramName} parameter` });
        return;
      }

      const kit = await KitModel.findById(kitId).select('userId').lean();
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

export function requirePracticeOwnership(paramName = 'kitId') {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kitId = req.params[paramName];
      if (!kitId) {
        res.status(400).json({ error: `Missing ${paramName} parameter` });
        return;
      }

      const record = await PracticeRecord.findOne({ kitId, userId: req.user!.id }).select('_id').lean();
      if (!record) {
        res.status(404).json({ error: 'Practice record not found' });
        return;
      }

      next();
    } catch (error) {
      logger.error({ err: error }, 'Practice ownership check error');
      res.status(500).json({ error: 'Authorization error' });
    }
  };
}

export function attachKitIfOwned(paramName = 'kitId') {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kitId = req.params[paramName];
      if (!kitId) {
        return next();
      }

      const kit = await KitModel.findById(kitId).select('userId').lean();
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