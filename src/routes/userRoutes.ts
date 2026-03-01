import { Router } from 'express';
import { getMe, getUserBookings, getUserStats, getUserSpendingGraph } from '../controllers/userController';
import { verifyToken, requireUser } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Protect all routes
router.use(verifyToken, requireUser);

router.get('/me', asyncHandler(getMe));
router.get('/bookings', asyncHandler(getUserBookings));
router.get('/stats', asyncHandler(getUserStats));
router.get('/spending-graph', asyncHandler(getUserSpendingGraph));

export default router;
