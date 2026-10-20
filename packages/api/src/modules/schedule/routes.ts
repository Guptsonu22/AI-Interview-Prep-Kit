import { Router } from 'express';
import { KitModel } from '../../db/models';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler, AppError } from '../../middleware/errorHandler';

const router = Router();

router.get('/:kitId', asyncHandler(async (req: AuthRequest, res) => {
  const kit = await KitModel.findOne({ _id: req.params['kitId'], userId: req.user!.id }).lean();
  if (!kit) {
    throw new AppError(404, 'Kit not found');
  }

  const kitData = kit.kitData as { dailySchedule?: unknown[]; metadata?: { totalEstimatedHours?: number } };
  const schedule = kitData.dailySchedule || [];
  const metadata = kitData.metadata || {};

  res.json({
    schedule,
    totalDays: kit['prepDays'],
    totalEstimatedHours: metadata.totalEstimatedHours || 0,
  });
}));

export { router as scheduleRouter };