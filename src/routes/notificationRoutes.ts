import { Router } from 'express';
import { getNotifications, markNotificationRead, markAllRead } from '../controllers/notificationController';
import { verifyToken } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(verifyToken);
router.get('/', asyncHandler(getNotifications));
router.patch('/:id/read', asyncHandler(markNotificationRead));
router.patch('/read-all', asyncHandler(markAllRead));

export default router;
